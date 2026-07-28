//
//  ManageSongsView.swift
//  GraceChords Studio
//
//  The editor+ section: a list of every song this account can see — drafts included
//  — and the editor for the selected one.
//
//  A separate section rather than a mode bolted onto the Library/Viewer split, for
//  two concrete reasons. The Viewer installs `.focusedSceneObject(export)` and owns
//  the File ▸ Export menu plus its own toolbar, and an editor mode inside it would
//  contend for both. And the two surfaces own different state: the Library owns
//  "which song is selected for reading", while the editor owns "does this song have
//  unsaved changes" — collapsing them means one view holding both, where a stale
//  dirty flag can outlive the song it belonged to.
//
//  Drafts are listed here because RLS returns them: `songs_select` admits
//  `status = 'draft'` rows for editor+. Nothing in this file filters on status.
//

import SwiftUI

struct ManageSongsView: View {
    let services: AppServices
    @ObservedObject var library: LibraryViewModel
    var onSessionExpired: () -> Void

    /// nil = nothing open. `.new` = an unsaved blank draft.
    @State private var openSong: OpenSong?
    /// The live editor, owned here.
    ///
    /// Held in @State rather than built where it is used: a model constructed inside
    /// `body` would be a NEW model on every re-render, so every keystroke would
    /// discard the edit that caused the re-render. It is replaced only when
    /// `openSong` actually changes.
    @State private var editor: SongEditorModel?
    @State private var query = ""

    private enum OpenSong: Hashable, Identifiable {
        case new
        case existing(id: String)

        var id: String {
            switch self {
            case .new: return "new"
            case .existing(let id): return id
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(min: 240, ideal: 300, max: 380)
        } detail: {
            detail
        }
        .navigationSplitViewStyle(.balanced)
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        VStack(spacing: 0) {
            HStack(spacing: GCSpacing.sm) {
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
                    }
                }
                .padding(.horizontal, GCSpacing.sm)
                .padding(.vertical, 5)
                .background(GCColor.surfaceAlt, in: RoundedRectangle(cornerRadius: GCRadius.sm))
            }
            .padding(GCSpacing.sm)

            Divider()
            list
        }
        .navigationTitle("Manage Songs")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    open(.new)
                } label: {
                    Label("New Song", systemImage: "plus")
                }
                .keyboardShortcut("n", modifiers: .command)
                .help("Create a new song as a draft")
            }
        }
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
                    Section("Drafts (\(drafts.count))") {
                        ForEach(drafts) { song in
                            ManageRow(song: song).tag(song.id)
                        }
                    }
                }
                Section("Published (\(published.count))") {
                    ForEach(published) { song in
                        ManageRow(song: song).tag(song.id)
                    }
                }
            }
            .listStyle(.sidebar)
        }
    }

    /// The list drives selection by song id, but `openSong` also has a `.new` case
    /// that no row corresponds to — so a `.new` editor shows no row as selected, and
    /// picking a row replaces it.
    private var selectionBinding: Binding<String?> {
        Binding(
            get: {
                if case .existing(let id) = openSong { return id }
                return nil
            },
            set: { id in
                if let id = id { open(.existing(id: id)) } else { closeEditor() }
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
        if let editor = editor, let openSong = openSong {
            SongEditorView(model: editor, knownTags: library.availableTags, onClose: closeEditor)
                // Keyed on the open song so switching songs rebuilds the view's own
                // @State (pending-tag text, dialog flags) rather than carrying the
                // previous song's over.
                .id(openSong.id)
        } else {
            VStack(spacing: GCSpacing.sm) {
                Text("Select a song to edit")
                    .gcTextStyle(.body)
                    .foregroundStyle(GCColor.sec)
                Button("New Song") { open(.new) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// Open a song, replacing any editor already open.
    ///
    /// Building the model here rather than in `body` is what keeps an in-progress
    /// edit alive across re-renders. Re-opening the song that is already open is a
    /// no-op, so clicking the selected row does not silently discard edits.
    private func open(_ song: OpenSong) {
        guard song != openSong else { return }
        openSong = song

        let model: SongEditorModel
        switch song {
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
            openSong = .existing(id: saved.id)
        }
        model.onDeleted = { id in
            library.remove(id: id)
            closeEditor()
        }
        editor = model
    }

    private func closeEditor() {
        openSong = nil
        editor = nil
    }
}

/// A Manage sidebar row. Unlike the Library's SongRow this one shows publication
/// state, because in this section it is the most important thing about a song.
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
