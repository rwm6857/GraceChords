//
//  LibraryViewModel.swift
//  GraceChords Studio
//
//  Loads the catalog once and filters in memory — the same shape as apps/mobile
//  (src/lib/useSongList.ts fetches the whole list; SongLibraryScreen searches the
//  loaded array). Selection lives here too, so the sidebar and the narrow-window
//  single-pane layout share one source of truth.
//

// `Combine` is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY, under which `ObservableObject`
// and `@Published` are not visible through a transitive import.
import Combine
import Foundation

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published var query = ""
    @Published var selectedSlug: String?
    @Published var sortKey: SortKey = .title
    @Published var sortDirection: SortDirection = .ascending
    /// Tag filter — a song matches if it carries ANY selected tag, as on mobile.
    @Published var selectedTags: Set<String> = []
    @Published private(set) var songs: [SongListItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorText: String?
    /// Set when a query reports a rejected token; the shell turns this into a
    /// sign-out so an expired session lands on the sign-in screen.
    @Published private(set) var sessionExpired = false

    private let repository: SongsRepository
    private var hasLoaded = false

    init(repository: SongsRepository) {
        self.repository = repository
    }

    /// Every tag present in the catalog, sorted — the filter list's contents.
    var availableTags: [String] {
        Set(songs.flatMap { $0.tags ?? [] }).sorted()
    }

    /// The catalog with the tag filter applied. Search and grouping both work from
    /// here, so a tag filter narrows results as well as sections — mobile's order
    /// of operations.
    private var tagFiltered: [SongListItem] {
        guard !selectedTags.isEmpty else { return songs }
        return songs.filter { song in
            (song.tags ?? []).contains { selectedTags.contains($0) }
        }
    }

    /// Whether any filter or non-default sort is active, for the toolbar accent.
    var isFilterActive: Bool {
        sortKey != .title || sortDirection != .ascending || !selectedTags.isEmpty
    }

    var isSearching: Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Grouped sections for the active sort. Used when not searching; a search
    /// replaces the grouping with a flat ranked list, as on mobile.
    var sections: [LibrarySection] {
        LibrarySort.sections(for: tagFiltered, sortKey: sortKey, direction: sortDirection)
    }

    /// The A–Z letters actually present, for the index. Empty when the active sort
    /// has no letters.
    var presentLetters: [String] {
        guard sortKey.isLettered, !isSearching else { return [] }
        return sections.compactMap(\.letter)
    }

    /// How many songs the list is currently showing, for the result count.
    var visibleCount: Int {
        isSearching ? results.count : sections.reduce(0) { $0 + $1.songs.count }
    }

    func toggleTag(_ tag: String) {
        if selectedTags.contains(tag) { selectedTags.remove(tag) } else { selectedTags.insert(tag) }
    }

    /// Tapping the active sort flips its direction; a different one selects it
    /// ascending. Mobile's `onToggleSort`.
    func selectSort(_ key: SortKey) {
        if sortKey == key {
            sortDirection = sortDirection.toggled
        } else {
            sortKey = key
            sortDirection = .ascending
        }
    }

    func clearFilters() {
        sortKey = .title
        sortDirection = .ascending
        selectedTags = []
    }

    /// Songs matching `query`, ranked exactly as apps/mobile's songMatchRank does:
    /// title matches (0) above tag-only matches (1), ties broken by title.
    /// Artist is deliberately not searched — mobile does not search it either,
    /// despite what its search placeholder says.
    var results: [SongListItem] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return tagFiltered }

        return tagFiltered
            .compactMap { song -> (song: SongListItem, rank: Int)? in
                guard let rank = Self.matchRank(song, query: trimmed) else { return nil }
                return (song, rank)
            }
            .sorted { left, right in
                if left.rank != right.rank { return left.rank < right.rank }
                return left.song.title.localizedCompare(right.song.title) == .orderedAscending
            }
            .map { $0.song }
    }

    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        await load()
    }

    func load() async {
        isLoading = true
        errorText = nil
        do {
            songs = try await repository.fetchSongList()
            hasLoaded = true
            // A selection that is no longer in the catalog would leave the viewer
            // pointing at nothing.
            if let selected = selectedSlug, !songs.contains(where: { $0.slug == selected }) {
                selectedSlug = nil
            }
        } catch SongsRepositoryError.sessionExpired {
            sessionExpired = true
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
        isLoading = false
    }

    // MARK: - Local mutations

    /// Fold a saved song into the loaded list in place.
    ///
    /// Applied locally rather than by refetching so the sidebar updates the instant
    /// a save returns, with no second round trip and no scroll-position reset. The
    /// row that comes back is the row the database actually wrote, so this cannot
    /// drift from the server the way an optimistic guess could.
    func upsert(_ saved: SongEditable) {
        let item = SongListItem(
            id: saved.id,
            slug: saved.slug,
            title: saved.title,
            artist: saved.artist,
            defaultKey: saved.defaultKey,
            timeSignature: saved.timeSignature,
            tags: saved.tags,
            tempo: saved.tempo,
            // The list query selects created_at but the editor's does not. Preserve
            // whatever the existing row had so a save cannot reorder the
            // "recently added" sort; a newly inserted row legitimately has none
            // loaded yet and sorts as unknown until the next full load.
            createdAt: songs.first(where: { $0.id == saved.id })?.createdAt,
            status: saved.status
        )
        if let index = songs.firstIndex(where: { $0.id == saved.id }) {
            songs[index] = item
        } else {
            songs.append(item)
        }
        // Sections and search recompute from `songs`, so re-sorting here is not
        // needed for display — but keeping the array title-ordered matches what a
        // reload would produce, so the two paths cannot diverge.
        songs.sort { $0.title.localizedCompare($1.title) == .orderedAscending }
    }

    /// Drop a hard-deleted song from the loaded list.
    func remove(id: String) {
        guard let index = songs.firstIndex(where: { $0.id == id }) else { return }
        let removed = songs.remove(at: index)
        // The Viewer is keyed on slug; leaving it selected would point it at a row
        // that no longer exists.
        if selectedSlug == removed.slug { selectedSlug = nil }
    }

    private static func matchRank(_ song: SongListItem, query: String) -> Int? {
        if song.title.lowercased().contains(query) { return 0 }
        for tag in song.tags ?? [] where tag.lowercased().contains(query) { return 1 }
        return nil
    }
}
