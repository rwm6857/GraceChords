//
//  LibraryViewModel.swift
//  GraceChords Studio
//
//  Loads the catalog once and filters in memory — the same shape as apps/mobile
//  (src/lib/useSongList.ts fetches the whole list; SongLibraryScreen searches the
//  loaded array). Selection lives here too, so the sidebar and the narrow-window
//  single-pane layout share one source of truth.
//

import Foundation

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published var query = ""
    @Published var selectedSlug: String?
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

    /// Songs matching `query`, ranked exactly as apps/mobile's songMatchRank does:
    /// title matches (0) above tag-only matches (1), ties broken by title.
    /// Artist is deliberately not searched — mobile does not search it either.
    var results: [SongListItem] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return songs }

        return songs
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

    private static func matchRank(_ song: SongListItem, query: String) -> Int? {
        if song.title.lowercased().contains(query) { return 0 }
        for tag in song.tags ?? [] where tag.lowercased().contains(query) { return 1 }
        return nil
    }
}
