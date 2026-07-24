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
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search titles and tags", text: $model.query)
                .textFieldStyle(.plain)
            if !model.query.isEmpty {
                Button {
                    model.query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.songs.isEmpty {
            centered { ProgressView() }
        } else if let errorText = model.errorText {
            centered {
                VStack(spacing: 10) {
                    Text(errorText)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
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
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func centered<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack { content() }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct SongRow: View {
    let song: SongListItem

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(song.title)
                    .lineLimit(1)
                if let artist = song.artist, !artist.isEmpty {
                    Text(artist)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 2) {
                if let key = song.defaultKey, !key.isEmpty {
                    Text(key).font(.caption.weight(.medium))
                }
                if let timeSignature = song.timeSignature, !timeSignature.isEmpty {
                    Text(timeSignature).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
