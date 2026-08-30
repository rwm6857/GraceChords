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

// AppKit for NSPasteboard — the import banner's Copy Diagnostics.
import AppKit
// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import Foundation
// The caret lives here rather than in the view because the menu bar's Insert
// commands have to act on it, and a menu cannot reach a view's private @State.
import SwiftUI

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

    /// Trailing debounce before unsaved work is written to disk.
    ///
    /// Longer than the preview's 300ms because nothing is watching the result: the
    /// preview has to keep up with the eye, a draft only has to beat a crash. 1.5s
    /// means an ordinary paragraph of typing costs one small write rather than a
    /// dozen, and the most that can ever be lost is the last second and a half.
    static let draftDebounce = Duration.milliseconds(1500)

    /// Identifies *this editing session*, not the song.
    ///
    /// The text view keys its undo stack on it. A model is built fresh for every
    /// song opened — including each blank draft — so a change here means "a different
    /// document is in the editor now", which is the moment the undo history has to be
    /// dropped. Song ID will not do: a new draft has none, so two blank drafts in a
    /// row would look like the same document and ⌘Z in the second could resurrect the
    /// first. `ManageSongsView`'s `.id(target.id)` usually rebuilds the view anyway;
    /// this covers the case where it does not.
    let instanceID = UUID()

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
            scheduleDraftWrite()
        }
    }

    /// The form as it was last saved, for the dirty check.
    private var savedForm: SongForm

    // MARK: - Draft recovery

    /// Where unsaved work is kept between launches.
    private let drafts: DraftStore
    /// This editor's slot in the store — `EditorSession.Target.id`, so a song's id or
    /// the literal `new`. Fixed for the life of the model even after a new song's
    /// first save gives it a real id, because the file to clean up is the one that
    /// was written.
    private let draftKey: String
    private var draftTask: Task<Void, Never>?
    private var terminationObserver: NSObjectProtocol?

    /// When the work now on screen was recovered from disk, for the banner. Nil when
    /// nothing was restored, which is the ordinary case.
    @Published private(set) var restoredDraftAt: Date?

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

    /// Everything core's linter said about the current body, unfiltered.
    ///
    /// Kept raw and filtered on read because two of the codes depend on the *form*,
    /// not the body: `missing_title` and `missing_key` have to disappear the moment
    /// the Title or Key field is filled, and re-linting on every keystroke in those
    /// fields to discover that would put a JavaScriptCore call behind the Title field.
    @Published private(set) var rawWarnings: [LintWarning] = []

    /// The warnings worth showing.
    var warnings: [LintWarning] {
        Self.applicable(rawWarnings, title: form.title, key: form.defaultKey)
    }

    /// Drop the two codes the form's own columns answer.
    ///
    /// `lintChordPro` assumes a standalone `.chordpro` file where `{title}` and
    /// `{key}` in the body are the only place that metadata lives. Here it lives in
    /// columns, and core's `canonicalizeForm` is explicit that it will not inject it
    /// into the body — so every one of the 206 songs in the catalog trips both. A
    /// panel that is wrong twice about every song is a panel nobody reads, and it
    /// buried the codes that matter (`section_mismatch`, `unknown_chord`).
    ///
    /// Filtered at the Studio boundary rather than in core: the module is correct for
    /// the input it documents, `apps/web` has a test asserting exactly that output,
    /// and a row whose column *is* empty still gets its warning.
    static func applicable(_ warnings: [LintWarning], title: String, key: String) -> [LintWarning] {
        warnings.filter { warning in
            switch warning.code {
            case LintWarning.missingTitle: return title.trimmed.isEmpty
            case LintWarning.missingKey: return key.trimmed.isEmpty
            default: return true
            }
        }
    }
    @Published var showsPreview = true

    /// Where the caret is in the ChordPro body, bound by `ChordProTextView`.
    ///
    /// `NSRange` because its offsets are UTF-16 code units, which is exactly what a
    /// JS string index means — so the caret crosses the bridge without a conversion
    /// step. (`TextEditor`'s `TextSelection` carried `String.Index`es, which count
    /// Characters, and the two disagree on any Turkish or Korean lyric.)
    @Published var selection: NSRange?

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

    // MARK: - PDF import

    @Published var showsImportSheet = false
    @Published private(set) var isImporting = false
    @Published private(set) var importingFilename: String?
    /// Failures stay in the sheet, not the editor's banner: the user is still standing
    /// at the dropzone and the useful next move is to drop a different file.
    @Published var importError: String?
    /// A draft waiting on "replace the current text?". Non-nil drives the confirmation.
    @Published var pendingImport: SongDraft?
    /// What the last import did and what to check, for the editor's banner.
    @Published var importSummary: String?
    @Published private(set) var importConfidence: Int?
    /// The extraction behind the last import, kept only so its JSON can be copied out
    /// when the result needs tuning. Cleared with the banner.
    private var lastImportDiagnostics: PDFExtraction?

    /// Below the confidence bar the banner offers the diagnostics as well as the
    /// summary — that is the pair that makes a bad import fixable rather than
    /// mysterious.
    var importNeedsAttention: Bool {
        guard let confidence = importConfidence else { return false }
        return confidence < SongDraft.lowConfidence
    }

    func dismissImportSummary() {
        importSummary = nil
        importConfidence = nil
        lastImportDiagnostics = nil
    }

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
    init(services: AppServices, drafts: DraftStore = .applicationSupport()) {
        self.services = services
        self.drafts = drafts
        self.draftKey = "new"
        self.form = SongForm()
        self.savedForm = SongForm()
        self.songID = nil
        self.slug = nil
        self.status = .draft
        observeTermination()
    }

    /// An existing song, loaded by id.
    init(services: AppServices, songID: String, drafts: DraftStore = .applicationSupport()) {
        self.services = services
        self.drafts = drafts
        self.draftKey = songID
        self.form = SongForm()
        self.savedForm = SongForm()
        self.songID = songID
        self.slug = nil
        self.status = .published
        observeTermination()
    }

    deinit {
        if let observer = terminationObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Loading

    func load() async {
        guard let songID = songID else {
            // A blank draft still lints, so the "missing title / missing key"
            // warnings are visible from the start rather than after the first
            // keystroke.
            restoreDraftIfPresent()
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
            // After `apply`, so `savedForm` is the server's copy and restored work
            // reads as unsaved against it rather than as the saved state.
            restoreDraftIfPresent()
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

    // MARK: - Draft recovery

    /// Put unsaved work from a previous launch back on screen.
    ///
    /// Only ever writes to `form`, never `savedForm`: the draft is unsaved work, and
    /// after this the editor is dirty and the toolbar's Save is the thing that makes
    /// it real. A draft that matches what was loaded is not a recovery at all — it is
    /// deleted silently rather than announced, because a banner about nothing trains
    /// people to dismiss banners.
    private func restoreDraftIfPresent() {
        guard let snapshot = drafts.read(key: draftKey) else { return }
        guard snapshot.form != savedForm else {
            drafts.clear(key: draftKey)
            return
        }
        form = snapshot.form
        restoredDraftAt = snapshot.savedAt
        // `form`'s didSet only schedules a debounced refresh; the preview should show
        // the recovered body immediately, not 300ms after the song opens.
        refreshNow()
    }

    /// Throw away recovered work and go back to what was loaded.
    func discardRestoredDraft() {
        form = savedForm
        restoredDraftAt = nil
        clearDraft()
    }

    func dismissRestoredDraftBanner() {
        restoredDraftAt = nil
    }

    /// Called from the unsaved-changes guard's Discard, so leaving without saving does
    /// not leave the abandoned text to come back the next time the song is opened.
    func discardDraft() {
        clearDraft()
    }

    private func scheduleDraftWrite() {
        draftTask?.cancel()
        draftTask = Task { [weak self] in
            try? await Task.sleep(for: Self.draftDebounce)
            guard !Task.isCancelled else { return }
            self?.writeDraft()
        }
    }

    /// Write if there is unsaved work, delete if there is not.
    ///
    /// Deleting on a clean form is what makes this self-correcting: undoing back to
    /// the saved text, or saving from another window, removes the file rather than
    /// leaving a stale draft to be offered later.
    private func writeDraft(synchronously: Bool = false) {
        guard isDirty else {
            clearDraft()
            return
        }
        let snapshot = SongDraftSnapshot(key: draftKey, form: form, savedAt: Date())
        let store = drafts
        if synchronously {
            store.write(snapshot)
        } else {
            // Off the main thread: this competes with typing for the run loop, and
            // unlike the preview refresh nothing on screen is waiting for it.
            Task.detached(priority: .utility) { store.write(snapshot) }
        }
    }

    private func clearDraft() {
        draftTask?.cancel()
        draftTask = nil
        let store = drafts
        let key = draftKey
        Task.detached(priority: .utility) { store.clear(key: key) }
    }

    /// Flush on quit, synchronously.
    ///
    /// The debounce is the mechanism that survives a crash; this is the one that
    /// survives ⌘Q landing inside it. Ordinary quits still go through the
    /// unsaved-changes guard first — this is for the paths that do not, and for the
    /// second and a half the debounce has not yet written.
    private func observeTermination() {
        terminationObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.writeDraft(synchronously: true) }
        }
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

        // Lint runs even on an empty body, and before the render: a blank draft
        // should say "Missing {title}" from the moment it opens rather than after the
        // first keystroke, and a body the *parser* rejects is exactly when its
        // warnings are most worth having.
        relint(body)

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

    private func relint(_ body: String) {
        guard let bridge = services.bridge else { return }
        do {
            rawWarnings = try bridge.lint(body)
        } catch {
            // A lint failure is not worth a banner — the preview and its parse error
            // are already saying whatever is wrong with the body. Holding the previous
            // warnings rather than clearing them keeps the strip from flickering empty
            // mid-edit, the same reason the preview holds its last good chart.
        }
    }

    // MARK: - Lint navigation

    /// Put the caret on the line a warning points at, if it points at one.
    ///
    /// Returns whether it moved, so the strip can render an unjumpable row as text
    /// rather than as a button that does nothing when clicked.
    @discardableResult
    func jump(to warning: LintWarning) -> Bool {
        guard let range = LintLocator.range(
            for: warning,
            in: form.chordproContent,
            sectionCount: previewDoc?.sections.count ?? 0
        ) else { return false }
        selection = range
        return true
    }

    func canJump(to warning: LintWarning) -> Bool {
        LintLocator.bodyLine(
            for: warning,
            in: form.chordproContent,
            sectionCount: previewDoc?.sections.count ?? 0
        ) != nil
    }

    // MARK: - Quick insert

    /// The JS bridge, for the quick-insert toolbar. Exposed rather than duplicating a
    /// services reference in the view.
    var bridge: CoreBridge? { services.bridge }

    /// UTF-16 range of the current selection, defaulting to the end of the body.
    ///
    /// Appending when there is no caret yet is the useful default: the toolbar is most
    /// often used on a body written top to bottom, and inserting at offset 0 would push
    /// new sections above everything already typed.
    var selectionRange: (start: Int, end: Int) {
        let length = form.chordproContent.utf16.count
        guard let selection = selection else { return (length, length) }
        // Clamped: the body can be replaced out from under a caret (a PDF import, an
        // undo), and an offset past the end would be handed to core as a real one.
        let start = max(0, min(selection.location, length))
        let end = max(start, min(selection.location + selection.length, length))
        return (start, end)
    }

    var hasSelection: Bool {
        let range = selectionRange
        return range.end > range.start
    }

    var selectedText: String {
        let range = selectionRange
        guard range.end > range.start else { return "" }
        // NSString substring rather than a String.Index walk: the offsets are already
        // UTF-16, which is the unit NSString indexes in.
        return (form.chordproContent as NSString)
            .substring(with: NSRange(location: range.start, length: range.end - range.start))
    }

    /// Insert `text` at the caret, replacing any selection, through core.
    func insert(_ text: String) {
        let range = selectionRange
        apply { bridge in
            try bridge.insertAtCursor(in: form.chordproContent, start: range.start, end: range.end, text: text)
        }
    }

    /// Wrap the selection in a section block, through core.
    func wrap(_ preset: SectionPreset) {
        let range = selectionRange
        apply { bridge in
            try bridge.wrapSection(
                in: form.chordproContent,
                start: range.start,
                end: range.end,
                directive: preset.directive,
                label: preset.sectionLabel
            )
        }
    }

    /// Wrap using the core preset with this label — how the menu-bar commands reach
    /// the same code path the toolbar buttons use, without duplicating the preset list.
    func wrapSection(labeled label: String) {
        guard let preset = (try? services.bridge?.sectionPresets())??
            .first(where: { $0.label == label }) else { return }
        wrap(preset)
    }

    private func apply(_ edit: (CoreBridge) throws -> ChordProEdit) {
        guard let bridge = services.bridge else {
            errorText = services.bridgeErrorText ?? "The ChordPro helpers are unavailable."
            return
        }
        do {
            let result = try edit(bridge)
            form.chordproContent = result.value
            // Against the NEW body — the offsets core returned index into that, not the
            // text the range was read from.
            selection = result.selection.range
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }

    /// Raw lyrics for a body the parser cannot handle — the Viewer's fallback,
    /// reused so an unparseable draft still previews something readable.
    var rawFallbackLines: [String] {
        SongViewerModel.rawFallbackLines(from: form.chordproContent)
    }

    // MARK: - PDF import

    /// Read a chord-sheet PDF and put it in the form.
    ///
    /// Extraction runs off the main thread — PDFKit's thread safety is undocumented,
    /// so it gets one detached task rather than a shared queue — and the bridge call
    /// happens back on the main actor, because CoreBridge is not thread-safe.
    ///
    /// A body that already has text in it is not replaced without asking: the import
    /// has no review step, so this is the one point where a confirmation is worth its
    /// cost. `pendingImport` holds the draft while the editor asks.
    func importPDF(from url: URL) {
        start(named: url.lastPathComponent) { try PDFTextExtractor.extract(from: url) }
    }

    /// Import bytes already read on the app's behalf — the drag-and-drop path.
    ///
    /// A file URL taken off the dragging pasteboard carries no sandbox grant, so the
    /// drop handler fetches the bytes through the item provider and passes them here
    /// rather than a URL this process is not allowed to open.
    func importPDF(data: Data, filename: String) {
        start(named: filename) { try PDFTextExtractor.extract(from: data) }
    }

    private func start(named filename: String, _ read: @escaping @Sendable () throws -> PDFExtraction) {
        guard !isImporting else { return }
        isImporting = true
        importError = nil
        importingFilename = filename

        Task { [weak self] in
            let outcome: Result<PDFExtraction, Error>
            do {
                // Detached, because this Task would otherwise inherit the model's
                // MainActor isolation and read the whole document on the main thread.
                outcome = .success(try await Task.detached(priority: .userInitiated, operation: read).value)
            } catch {
                outcome = .failure(error)
            }
            self?.finishImport(outcome)
        }
    }

    private func finishImport(_ outcome: Result<PDFExtraction, Error>) {
        isImporting = false
        importingFilename = nil

        guard let bridge = services.bridge else {
            importError = services.bridgeErrorText ?? "The ChordPro helpers are unavailable, so the PDF cannot be converted."
            return
        }

        do {
            let extraction = try outcome.get()
            let draft = try bridge.pdfDraft(from: extraction)
            lastImportDiagnostics = extraction
            showsImportSheet = false
            if form.chordproContent.trimmed.isEmpty {
                apply(draft)
            } else {
                pendingImport = draft
            }
        } catch {
            importError = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }

    /// Take the draft the user confirmed replacing their text with.
    func confirmPendingImport() {
        guard let draft = pendingImport else { return }
        pendingImport = nil
        apply(draft)
    }

    func discardPendingImport() {
        pendingImport = nil
        lastImportDiagnostics = nil
    }

    func cancelImport() {
        showsImportSheet = false
        importError = nil
    }

    func reportImportFailure(_ message: String) {
        isImporting = false
        importingFilename = nil
        importError = message
    }

    /// The extraction JSON behind the last import, for the banner's Copy Diagnostics.
    ///
    /// This is the whole input to `packages/core`'s `buildSongDraft`, so pasting it
    /// into `node apps/studio/js/pdf-draft.mjs` reproduces the result exactly — which
    /// is how the heuristics get tuned against a chart that came out wrong.
    func copyImportDiagnostics() {
        guard let extraction = lastImportDiagnostics else { return }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(extraction), let json = String(data: data, encoding: .utf8) else {
            errorText = "The diagnostics could not be encoded."
            return
        }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(json, forType: .string)
        statusMessage = "Diagnostics copied."
    }

    /// One `form` mutation, so the `didSet` above fires once: badges reset and a
    /// single preview refresh is scheduled rather than one per field.
    ///
    /// `savedForm` is deliberately left alone, which makes `isDirty` true — an import
    /// is unsaved work, exactly as the web editor treats one, and nothing has been
    /// written to Supabase.
    private func apply(_ draft: SongDraft) {
        var next = form
        if let title = draft.title, !title.isEmpty { next.title = title }
        if let key = draft.key, !key.isEmpty { next.defaultKey = key }
        if let artist = draft.artist, !artist.isEmpty { next.artist = artist }
        if let tempo = draft.tempo, !tempo.isEmpty { next.tempo = tempo }
        if let time = draft.timeSignature, !time.isEmpty { next.timeSignature = time }
        next.chordproContent = draft.chordpro
        form = next

        importSummary = draft.summary
        importConfidence = draft.confidence
        errorText = nil
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
            // The server now has it, so the recovery copy is not just redundant but
            // wrong — offering it later would re-open work that is already live.
            restoredDraftAt = nil
            clearDraft()
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
            clearDraft()
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
