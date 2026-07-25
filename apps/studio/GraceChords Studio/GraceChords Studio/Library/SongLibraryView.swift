//
//  SongLibraryView.swift
//  GraceChords Studio
//
//  Search field + song list. Rows carry the same four values apps/mobile's rows
//  do: title, artist as subtitle, default key and time signature trailing.
//
//  Used in two places — the split view's sidebar when the window is wide, and the
//  detail column when it is narrow — so it owns no layout state of its own.
//

import SwiftUI

struct SongLibraryView: View {
    @ObservedObject var model: LibraryViewModel

    var body: some View {
        VStack(spacing: 0) {
            searchField
            Divider()
            content
        }
        .navigationTitle("Library")
    }

    private var searchField: some View {
        HStack(spacing: GCSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(GCColor.muted)
            TextField("Search titles and tags", text: $model.query)
                .textFieldStyle(.plain)
                .gcTextStyle(.body)
            if !model.query.isEmpty {
                Button {
                    model.query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(GCColor.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, GCSpacing.md)
        .padding(.vertical, GCSpacing.sm)
        // surfaceAlt is the token for recessed surfaces — "search field" is the
        // example native.ts names for it.
        .background(GCColor.surfaceAlt, in: .rect(cornerRadius: GCRadius.sm))
        .padding(GCSpacing.sm)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.songs.isEmpty {
            centered { ProgressView() }
        } else if let errorText = model.errorText {
            centered {
                VStack(spacing: GCSpacing.sm) {
                    Text(errorText)
                        .gcTextStyle(.body)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(GCColor.sec)
                    Button("Try Again") { Task { await model.load() } }
                }
                .padding()
            }
        } else {
            List(selection: $model.selectedSlug) {
                ForEach(model.results) { song in
                    SongRow(song: song)
                        .tag(song.slug)
                }
            }
            .overlay {
                if model.results.isEmpty {
                    Text(model.songs.isEmpty ? "No songs" : "No matches")
                        .gcTextStyle(.body)
                        .foregroundStyle(GCColor.sec)
                }
            }
        }
    }

    private func centered<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack { content() }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Row text takes its sizes from the token ramp, but deliberately keeps SwiftUI's
/// semantic foreground styles rather than `GCColor.ink` / `GCColor.sec`: this List
/// is selectable, and macOS inverts a selected row's text to read against the
/// accent fill. Only the automatic styles participate in that inversion, so
/// pinning token colors here would leave dark text on a Signal-blue selection.
/// Brand color shows up on this screen through the accent (selection, the search
/// field's recessed surface) instead.
private struct SongRow: View {
    let song: SongListItem

    var body: some View {
        HStack(alignment: .center, spacing: GCSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(song.title)
                    .gcTextStyle(.rowTitle)
                    .lineLimit(1)
                if let artist = song.artist, !artist.isEmpty {
                    Text(artist)
                        .gcTextStyle(.rowSubtitle)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: GCSpacing.xs)
            VStack(alignment: .trailing, spacing: 2) {
                if let key = song.defaultKey, !key.isEmpty {
                    Text(key).gcTextStyle(.rowKey)
                }
                if let timeSignature = song.timeSignature, !timeSignature.isEmpty {
                    Text(timeSignature)
                        .gcTextStyle(.rowMeta)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
