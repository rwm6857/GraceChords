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

    @State private var showsFilters = false
    /// Width of the library area, which decides whether the grid is worth it.
    @State private var availableWidth: CGFloat = 0

    /// Below this the library is a narrow sidebar and stays a single column. The
    /// grid is only offered where mobile's reason for it — a pane wide enough that
    /// one column wastes most of it — actually applies.
    private static let gridMinimumWidth: CGFloat = 620

    private var columns: Int {
        guard availableWidth >= Self.gridMinimumWidth else { return 1 }
        // The macOS reading of mobile's orientation split: the landscape count once
        // there is genuinely room for it.
        return availableWidth >= 980
            ? GCLayout.LibraryColumns.landscape
            : GCLayout.LibraryColumns.portrait
    }

    var body: some View {
        VStack(spacing: 0) {
            searchField
            Divider()
            content
        }
        .navigationTitle("Library")
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            guard abs(width - availableWidth) > 0.5 else { return }
            availableWidth = width
        }
    }

    private var searchField: some View {
        VStack(spacing: GCSpacing.xs) {
            HStack(spacing: GCSpacing.sm) {
                HStack(spacing: GCSpacing.sm) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(GCColor.muted)
                    // Mobile's placeholder mentions artists, but its songMatchRank
                    // does not search them — the behaviour is what is matched here.
                    TextField("Search songs and themes…", text: $model.query)
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
                // surfaceAlt is the token for recessed surfaces — "search field" is
                // the example native.ts names for it.
                .background(GCColor.surfaceAlt, in: .rect(cornerRadius: GCRadius.sm))

                Button {
                    showsFilters = true
                } label: {
                    Image(systemName: model.isFilterActive
                          ? "line.3.horizontal.decrease.circle.fill"
                          : "line.3.horizontal.decrease.circle")
                        .font(.system(size: 15))
                        .foregroundStyle(model.isFilterActive ? GCColor.accent : GCColor.muted)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Filter and sort")
                .accessibilityLabel("Filter and sort")
                .popover(isPresented: $showsFilters, arrowEdge: .bottom) {
                    FilterSortView(model: model) { showsFilters = false }
                }
            }

            // Result count, as on mobile. Shown only once a search or filter is
            // narrowing something, so an untouched catalog does not narrate its size.
            if model.isSearching || model.isFilterActive {
                HStack {
                    Text(model.visibleCount == 1 ? "1 result" : "\(model.visibleCount) results")
                        .gcTextStyle(.rowMeta)
                        .foregroundStyle(GCColor.muted)
                    Spacer()
                }
            }
        }
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
                if model.isSearching {
                    // A search replaces the grouping with one ranked list, as on
                    // mobile — letters would be meaningless against a relevance sort.
                    rows(for: model.results)
                } else {
                    ForEach(model.sections) { section in
                        if section.title.isEmpty {
                            rows(for: section.songs)
                        } else {
                            Section {
                                rows(for: section.songs)
                            } header: {
                                Text(section.title)
                                    .gcTextStyle(.overline)
                                    .foregroundStyle(GCColor.muted)
                            }
                        }
                    }
                }
            }
            .overlay {
                if model.visibleCount == 0 {
                    Text(emptyMessage)
                        .gcTextStyle(.body)
                        .foregroundStyle(GCColor.sec)
                        .multilineTextAlignment(.center)
                        .padding(GCSpacing.lg)
                }
            }
        }
    }

    /// Song rows, one per line in a sidebar and chunked into a grid when there is
    /// room. The single-column path stays a plain `List` row so macOS selection and
    /// keyboard navigation keep working untouched.
    @ViewBuilder
    private func rows(for songs: [SongListItem]) -> some View {
        if columns == 1 {
            ForEach(songs) { song in
                SongRow(song: song).tag(song.slug)
            }
        } else {
            ForEach(Array(chunked(songs).enumerated()), id: \.offset) { _, chunk in
                HStack(alignment: .top, spacing: GCSpacing.md) {
                    ForEach(chunk) { song in
                        gridCell(song)
                    }
                    // Keep the last row's cells the same width as a full row's.
                    if chunk.count < columns {
                        ForEach(0..<(columns - chunk.count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity)
                        }
                    }
                }
                .listRowSeparator(.hidden)
            }
        }
    }

    /// A grid cell selects on click and draws its own selected state: a chunked row
    /// is one `List` item, so the OS cannot highlight an individual song for us.
    private func gridCell(_ song: SongListItem) -> some View {
        let selected = model.selectedSlug == song.slug
        return Button {
            model.selectedSlug = song.slug
        } label: {
            SongRow(song: song)
                .padding(.horizontal, GCSpacing.sm)
                .padding(.vertical, GCSpacing.xs)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    selected ? GCColor.accentSoft : Color.clear,
                    in: RoundedRectangle(cornerRadius: GCRadius.sm, style: .continuous)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    private func chunked(_ songs: [SongListItem]) -> [[SongListItem]] {
        guard columns > 1 else { return songs.map { [$0] } }
        return stride(from: 0, to: songs.count, by: columns).map {
            Array(songs[$0..<min($0 + columns, songs.count)])
        }
    }

    private var emptyMessage: String {
        if model.songs.isEmpty { return "Your library is empty." }
        if model.isSearching {
            return "No songs match “\(model.query.trimmingCharacters(in: .whitespacesAndNewlines))”."
        }
        return "No songs match your filters."
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
