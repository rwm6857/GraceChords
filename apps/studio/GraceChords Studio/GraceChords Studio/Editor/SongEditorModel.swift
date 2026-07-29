//
//  SongEditorModel.swift
//  GraceChords Studio
//
//  State for one song being written: the form, the debounced live preview, the
//  lint warnings, and the save / publish / delete actions.
//
//  The preview reuses the Viewer's renderer rather than a second rendering path:
//  `CoreBridge.render` produces the same SongDoc the Viewer draws, and
//  Editor/SongEditorView hands it to the same `ChordChartView`. So the preview
//  cannot drift from what a worshipper sees — there is only one renderer.
//
//  Re-parsing is debounced rather than run per keystroke. Each refresh is a
//  JavaScriptCore parse + transpose map + JSON encode, then a JSONDecoder pass,
//  then a full SwiftUI re-layout of the chart — and CoreBridge is explicitly not
//  thread-safe, so all of that runs on the main thread and competes with typing for
//  the run loop.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import Foundation

@MainActor
final class SongEditorModel: ObservableObject {
    /// Trailing debounce before the preview and lint refresh.
    ///
    /// 300ms sits in the gap between two thresholds: a fast typist's inter-key
    /// interval is roughly 120–150ms, so a continuous burst of typing collapses to
    /// ONE refresh at the end of the burst rather than one per character; and a
    /// preview that lags more than ~400ms starts reading as disconnected from the
    /// keyboard. Raising this is the correct response if a long song ever feels
    /// heavy — moving the work off the main thread is not, because that would mean
    /// a second JSContext and therefore a second copy of the parser.
    static let previewDebounce = Duration.milliseconds(300)

    // MARK: - Form

    @Published var form: SongForm {
        didSet {
            guard form != oldValue else { return }
            // Any edit makes the last save's verdict stale — the file on the server
            // no longer matches what is on screen.
            saveOutcome = .idle
            publishOutcome = .idle
            // Only a body change needs the bridge; editing the tempo field must not
            // re-parse the chart.
            if form.chordproContent != oldValue.chordproContent {
                scheduleRefresh()
            }
        }
    }

    /// The form as it was last saved, for the dirty check.
    private var savedForm: SongForm

    var isDirty: Bool { form != savedForm }

    // MARK: - Identity and publication state

    /// nil until the first successful save — a new song has no row yet.
    @Published private(set) var songID: String?
    @Published private(set) var slug: String?
    @Published private(set) var status: SongStatus

    var isNew: Bool { songID == nil }

    // MARK: - Preview

    /// The chart as it should be drawn right now.
    ///
    /// Held across a refresh rather than cleared first, so the pane never blanks
    /// mid-edit: an in-flight parse leaves the previous good document on screen.
    @Published private(set) var previewDoc: SongDoc?
    /// Set when the body could not be parsed at all. Distinct from `warnings` —
    /// this is the parser throwing, not an advisory finding.
    @Published private(set) var previewErrorText: String?
    @Published var showsPreview = true

    /// How the last Save or Publish went, for the badge on its toolbar button.
    ///
    /// Transient by design: both reset to `.idle` on the next edit and on load, so
    /// the badge reports the outcome of an action just taken rather than becoming a
    /// second, stale status indicator.
    enum ActionOutcome: Equatable { case idle, succeeded, failed }
    @Published private(set) var saveOutcome: ActionOutcome = .idle
    @Published private(set) var publishOutcome: ActionOutcome = .idle

    // MARK: - Work state

    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published var errorText: String?
    @Published var statusMessage: String?

    private let services: AppServices
    private var refreshTask: Task<Void, Never>?
    /// The body the current `previewDoc` was built from, so an edit that lands back
    /// on the previously parsed text (typing a character and deleting it) skips the
    /// bridge entirely.
    private var lastRenderedBody: String?

    /// Called after a successful create, save, publish or delete so the library list
    /// can update without a refetch.
    var onSaved: ((SongEditable) -> Void)?
    var onDeleted: ((String) -> Void)?
    var onSessionExpired: (() -> Void)?

    // MARK: - Init

    /// A blank draft. No row is written until the first save: `songs.slug` is UNIQUE
    /// NOT NULL and core's slugify yields "" for an empty title, so a row genuinely
    /// cannot exist before there is a title — and creating one on "New Song" would
    /// leave an empty row behind every time the user changed their mind.
    init(services: AppServices) {
        self.services = services
        self.form = SongForm()
        self.savedForm = SongForm()
        self.songID = nil
        self.slug = nil
        self.status = .draft
    }

    /// An existing song, loaded by id.
    init(services: AppServices, songID: String) {
        self.services = services
        self.form = SongForm()
        self.savedForm = SongForm()
        self.songID = songID
        self.slug = nil
        self.status = .published
    }

    // MARK: - Loading

    func load() async {
        guard let songID = songID else {
            // A blank draft still lints, so the "missing title / missing key"
            // warnings are visible from the start rather than after the first
            // keystroke.
            refreshNow()
            return
        }
        isLoading = true
        errorText = nil
        do {
            guard let row = try await services.songs.fetchEditable(id: songID) else {
                errorText = "This song could not be found. It may have been deleted."
                isLoading = false
                return
            }
            apply(row)
        } catch SongsRepositoryError.sessionExpired {
            onSessionExpired?()
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
        isLoading = false
    }

    private func apply(_ row: SongEditable) {
        let loaded = SongForm(row: row)
        form = loaded
        savedForm = loaded
        songID = row.id
        slug = row.slug
        status = row.status
        refreshNow()
    }

    // MARK: - Preview refresh

    private func scheduleRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: Self.previewDebounce)
            guard !Task.isCancelled else { return }
            self?.refreshNow()
        }
    }

    /// Re-parse, re-render and re-lint the current body immediately.
    func refreshNow() {
        let body = form.chordproContent
        guard let bridge = services.bridge else {
            previewErrorText = services.bridgeErrorText ?? "The ChordPro parser is unavailable."
            return
        }
        guard body != lastRenderedBody else { return }
        lastRenderedBody = body

        guard !body.isEmpty else {
            previewDoc = nil
            previewErrorText = nil
            return
        }
        do {
            // steps 0 / letters: the editor previews the song in its own key. There
            // is no transpose control here — transposing is a reading concern, and
            // the Viewer owns it.
            previewDoc = try bridge.render(body, steps: 0, preferFlat: false, style: .letters)
            previewErrorText = nil
        } catch {
            // The previous document is deliberately NOT cleared: mid-edit a body is
            // transiently unparseable (a half-typed `{start_of_`), and blanking the
            // pane on every such keystroke would make the preview unusable. The
            // error is shown alongside the last good chart instead.
            previewErrorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }

    /// Raw lyrics for a body the parser cannot handle — the Viewer's fallback,
    /// reused so an unparseable draft still previews something readable.
    var rawFallbackLines: [String] {
        SongViewerModel.rawFallbackLines(from: form.chordproContent)
    }

    // MARK: - Saving

    /// Insert or update. Never changes `status` — see `SongWritePayload.init`.
    ///
    /// Editing a published song and saving leaves it published: silently
    /// un-publishing on save would pull a live song out of every worshipper's
    /// library because someone fixed a typo, and this design has no review step to
    /// put it back. Publication moves only through `publish()` / `unpublish()`.
    func save() async {
        guard form.isSavable else {
            errorText = "Give this song a title before saving."
            return
        }
        guard let bridge = services.bridge else {
            errorText = services.bridgeErrorText ?? "The ChordPro parser is unavailable, so the web address cannot be derived."
            return
        }

        isSaving = true
        errorText = nil
        statusMessage = nil
        defer { isSaving = false }

        do {
            let saved: SongEditable
            if let songID = songID {
                // The slug is NOT re-derived from a changed title. It is the song's
                // public URL on gracechords.com, and re-slugging on a title edit
                // would silently break every existing link and QR code pointing at
                // it. Core's upsertSong makes the same choice (`existing.slug ||
                // deriveUniqueSlug(...)`).
                guard let existingSlug = slug else {
                    errorText = "This song's web address is missing, so it cannot be saved safely."
                    return
                }
                let payload = SongWritePayload(form: form, slug: existingSlug, isInsert: false)
                saved = try await services.songs.update(id: songID, with: payload)
            } else {
                guard let newSlug = try await services.songs.uniqueSlug(for: form.title, bridge: bridge) else {
                    errorText = """
                    This title cannot be turned into a web address. \
                    Add at least one letter or number to it.
                    """
                    return
                }
                let payload = SongWritePayload(form: form, slug: newSlug, isInsert: true)
                saved = try await services.songs.insert(payload)
            }

            apply(saved)
            savedForm = form
            statusMessage = status == .published ? "Saved." : "Draft saved."
            await logAudit(.directSave, for: saved)
            onSaved?(saved)
        } catch SongsRepositoryError.sessionExpired {
            onSessionExpired?()
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }

    /// Publishing is where completeness is enforced — core's full
    /// `validateSongForm` rule, so Studio and the web editor admit the same songs to
    /// the public catalog. Saving a draft deliberately does not require this.
    func publish() async {
        guard form.isPublishable else {
            errorText = """
            Before publishing, fill in the key and at least one tag. \
            You can keep saving this as a draft in the meantime.
            """
            return
        }
        await moveStatus(to: .published, message: "Published. This song is now live.")
    }

    func unpublish() async {
        await moveStatus(to: .draft, message: "Unpublished. This song is now a draft.")
    }

    private func moveStatus(to next: SongStatus, message: String) async {
        guard let songID = songID else {
            errorText = "Save this song before publishing it."
            return
        }
        isSaving = true
        errorText = nil
        statusMessage = nil
        defer { isSaving = false }
        do {
            let saved = try await services.songs.setStatus(id: songID, to: next)
            status = saved.status
            slug = saved.slug
            statusMessage = message
            await logAudit(.directSave, for: saved)
            onSaved?(saved)
        } catch SongsRepositoryError.sessionExpired {
            onSessionExpired?()
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }

    /// Permanently delete. Hard delete, no recovery — the caller is responsible for
    /// having confirmed first.
    func delete() async {
        guard let songID = songID else { return }
        isSaving = true
        errorText = nil
        defer { isSaving = false }

        // Written BEFORE the delete, deliberately. `editor_audit_log.song_id` is
        // ON DELETE SET NULL, so this row survives the cascade with its song_slug
        // and song_title text intact — which is the only trace of the song that
        // remains afterwards.
        await logAudit(.deleted, songID: songID, slug: slug, title: form.title)

        do {
            try await services.songs.delete(id: songID)
            onDeleted?(songID)
        } catch SongsRepositoryError.sessionExpired {
            onSessionExpired?()
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }

    // MARK: - Audit log

    private func logAudit(_ action: EditorAuditEntry.Action, for row: SongEditable) async {
        await logAudit(action, songID: row.id, slug: row.slug, title: row.title)
    }

    /// Best-effort, matching core's callers: a failed audit write must never be the
    /// reason a save or delete reports failure, so the error is swallowed rather
    /// than surfaced.
    private func logAudit(
        _ action: EditorAuditEntry.Action,
        songID: String?,
        slug: String?,
        title: String
    ) async {
        let actorID = await services.users.currentUserID()
        let entry = EditorAuditEntry(
            action: action,
            actorID: actorID,
            // Null for a delete so the row is not itself removed by the FK cascade.
            songID: action == .deleted ? nil : songID,
            slug: slug,
            title: title
        )
        try? await services.songs.writeAuditLog(entry)
    }

    // MARK: - Display

    /// Sentence naming everything a delete destroys, used verbatim in the
    /// confirmation dialog. The setlist and favourites consequences are named
    /// because they are not obvious from "delete this song", and they are not
    /// recoverable: both FKs are ON DELETE CASCADE.
    var deleteConfirmationMessage: String {
        """
        This permanently deletes the song and its ChordPro content. It will also be \
        removed from every setlist that contains it, including other people's and \
        your team's, and all favourites for it will be lost.

        This cannot be undone. There is no recovery step.
        """
    }

    var windowTitle: String {
        let name = form.title.trimmed
        if name.isEmpty { return isNew ? "New Song" : "Untitled Song" }
        return name
    }
}
