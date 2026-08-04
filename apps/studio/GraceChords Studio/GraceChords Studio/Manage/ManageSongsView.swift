//
//  ManageSongsView.swift
//  GraceChords Studio
//
//  The editor+ section: a list of every song this account can see — drafts included
//  — and the editor for the selected one.
//
//  A separate section rather than a mode bolted onto the Library/Viewer split, for
//  two concrete reasons. The Viewer installs `.focusedSceneObject(export)` and owns
//  the File ▸ Export menu plus its own toolbar, which an editor mode would contend
//  with. And the two surfaces own different state: the Library owns "which song is
//  selected for reading", while the editor owns "does this song have unsaved
//  changes".
//
//  Drafts are listed here because RLS returns them: `songs_select` admits
//  `status = 'draft'` rows for editor+. Nothing in this file filters on status.
//

import SwiftUI

struct ManageSongsView: View {
    let services: AppServices
    @ObservedObject var library: LibraryViewModel
    @ObservedObject var session: EditorSession
    var onSessionExpired: () -> Void

    @State private var query = ""
    /// Where we are trying to go while the editor has unsaved work. Non-nil means the
    /// confirmation is up; `nil` target means "close the editor".
    @State private var pendingNavigation: PendingNavigation?

    private struct PendingNavigation: Identifiable {
        let target: EditorSession.Target?
        var id: String { target?.id ?? "close" }
    }

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(min: 240, ideal: 300, max: 380)
        } detail: {
            detail
        }
        .navigationSplitViewStyle(.balanced)
        // So File ▸ New Song goes through the same guard as the editor's button.
        .onAppear {
            session.requestNew = { requestNavigation(to: .new) }
            session.requestImport = {
                // With an editor already open the sheet goes on it — the import's own
                // "replace the song text?" confirmation covers a body with typing in
                // it, so there is nothing for this guard to add. With none open, a new
                // draft is not dirty, so `go` runs synchronously and the editor exists
                // by the next line.
                if session.editor == nil { requestNavigation(to: .new) }
                session.editor?.showsImportSheet = true
            }
        }
        .confirmationDialog(
            "Save changes to “\(session.editor?.windowTitle ?? "this song")”?",
            isPresented: Binding(
                get: { pendingNavigation != nil },
                set: { if !$0 { pendingNavigation = nil } }
            ),
            presenting: pendingNavigation
        ) { pending in
            Button("Save") {
                Task {
                    await session.editor?.save()
                    // Only leave if the save actually landed; otherwise the user stays
                    // put with the error banner rather than losing the work anyway.
                    if session.editor?.saveOutcome == .succeeded { go(to: pending.target) }
                    pendingNavigation = nil
                }
            }
            Button("Discard", role: .destructive) {
                go(to: pending.target)
                pendingNavigation = nil
            }
            Button("Cancel", role: .cancel) { pendingNavigation = nil }
        } message: { _ in
            Text("Your edits have not been saved. Discarding loses them.")
        }
    }

    // MARK: - Navigation

    /// Ask before leaving a dirty editor. Every path out of the editor goes through
    /// here — a different song, a new song, or closing it — so there is one place that
    /// knows unsaved work exists.
    func requestNavigation(to target: EditorSession.Target?) {
        if target == session.target { return }
        guard session.hasUnsavedChanges else {
            go(to: target)
            return
        }
        pendingNavigation = PendingNavigation(target: target)
    }

    private func go(to target: EditorSession.Target?) {
        guard let target = target else {
            session.close()
            return
        }

        let model: SongEditorModel
        switch target {
        case .new:
            model = SongEditorModel(services: services)
        case .existing(let id):
            model = SongEditorModel(services: services, songID: id)
        }
        model.onSessionExpired = onSessionExpired
        model.onSaved = { saved in
            library.upsert(saved)
            // A new draft had no row until this save, so the sidebar had nothing
            // selected. Point at the real row now — without rebuilding the model,
            // which would throw away the editor the user is still typing in.
            session.retarget(to: .existing(id: saved.id))
        }
        model.onDeleted = { id in
            library.remove(id: id)
            session.close()
        }
        session.open(target, model: model)
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        VStack(spacing: 0) {
            HStack(spacing: GCSpacing.sm) {
                Image(systemName: "magnifyingglass").foregroundStyle(GCColor.muted)
                TextField("Search songs…", text: $query)
                    .textFieldStyle(.plain)
                    .gcTextStyle(.body)
                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(GCColor.muted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, GCSpacing.sm)
            .padding(.vertical, 5)
            .background(GCColor.surfaceAlt, in: RoundedRectangle(cornerRadius: GCRadius.sm))
            .padding(GCSpacing.sm)

            Divider()
            list
        }
        .navigationTitle("Manage Songs")
    }

    @ViewBuilder
    private var list: some View {
        if library.isLoading, library.songs.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let errorText = library.errorText, library.songs.isEmpty {
            VStack(alignment: .leading, spacing: GCSpacing.sm) {
                Text(errorText).gcTextStyle(.rowMeta).foregroundStyle(GCColor.sec)
                Button("Try Again") { Task { await library.load() } }
            }
            .padding(GCSpacing.lg)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            List(selection: selectionBinding) {
                if !drafts.isEmpty {
                    Section("Drafts") {
                        ForEach(drafts) { song in
                            ManageRow(song: song).tag(song.id)
                        }
                    }
                }
                Section("Published") {
                    ForEach(published) { song in
                        ManageRow(song: song).tag(song.id)
                    }
                }
            }
            .listStyle(.sidebar)
        }
    }

    /// The list drives selection by song id, but the session also has a `.new` target
    /// that no row corresponds to — so a new draft shows no row selected, and picking
    /// a row routes through the unsaved-changes guard.
    private var selectionBinding: Binding<String?> {
        Binding(
            get: {
                if case .existing(let id) = session.target { return id }
                return nil
            },
            set: { id in
                requestNavigation(to: id.map { EditorSession.Target.existing(id: $0) })
            }
        )
    }

    private var filtered: [SongListItem] {
        let trimmed = query.trimmed.lowercased()
        guard !trimmed.isEmpty else { return library.songs }
        return library.songs.filter { song in
            song.title.lowercased().contains(trimmed)
                || (song.artist ?? "").lowercased().contains(trimmed)
                || (song.tags ?? []).contains { $0.lowercased().contains(trimmed) }
        }
    }

    /// Drafts first and in their own section: they are the work in progress, and a
    /// draft buried alphabetically among hundreds of published songs is a draft
    /// nobody finishes.
    private var drafts: [SongListItem] {
        filtered.filter(\.isDraft).sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
    }

    private var published: [SongListItem] {
        filtered.filter { !$0.isDraft }.sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
    }

    // MARK: - Detail

    @ViewBuilder
    private var detail: some View {
        if let editor = session.editor, let target = session.target {
            SongEditorView(
                model: editor,
                knownTags: library.tagsByFrequency,
                onNewSong: { requestNavigation(to: .new) }
            )
            // Keyed on the open song so switching songs rebuilds the view's own
            // @State (dialog flags, the accidental override) rather than carrying the
            // previous song's over.
            .id(target.id)
        } else {
            VStack(spacing: GCSpacing.md) {
                Text("Select a song to edit")
                    .gcTextStyle(.body)
                    .foregroundStyle(GCColor.sec)
                Button {
                    requestNavigation(to: .new)
                } label: {
                    Label("New Song", systemImage: "doc.badge.plus")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// A Manage sidebar row. Unlike the Library's SongRow this one shows publication
/// state through its section, so the row itself stays quiet.
private struct ManageRow: View {
    let song: SongListItem

    var body: some View {
        HStack(spacing: GCSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(song.title).gcTextStyle(.rowTitle).lineLimit(1)
                if let artist = song.artist, !artist.isEmpty {
                    Text(artist)
                        .gcTextStyle(.rowSubtitle)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: GCSpacing.xs)
            if let key = song.defaultKey, !key.isEmpty {
                Text(key).gcTextStyle(.rowKey).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
