//
//  LibrarySort.swift
//  GraceChords Studio
//
//  Grouping and sorting for the Song Library. Direct port of `buildSections`,
//  `bucketLetter` and `byTitle` in apps/mobile/src/screens/SongLibraryScreen.tsx.
//
//  Kept pure and free of SwiftUI so the rules are readable next to mobile's and
//  testable on their own:
//
//    - Title / Artist bucket by first letter (this is what drives the A–Z index).
//    - Key regroups into "Key of X", with the keyless songs under "No key".
//    - Recently added / Tempo are one flat, header-less section.
//    - The direction flips both the group order and the order within a group.
//

import Foundation

enum SortKey: String, CaseIterable, Identifiable, Sendable {
    case title, artist, key, recent, tempo

    var id: String { rawValue }

    /// Matches mobile's song.json `filterSheet.sort` strings.
    var label: String {
        switch self {
        case .title: return "Title"
        case .artist: return "Artist"
        case .key: return "Key"
        case .recent: return "Recently added"
        case .tempo: return "Tempo"
        }
    }

    /// Whether this sort produces lettered groups, i.e. whether an A–Z index means
    /// anything. Mobile gates its scrubber on exactly these two.
    var isLettered: Bool { self == .title || self == .artist }
}

enum SortDirection: String, Sendable {
    case ascending, descending

    var isDescending: Bool { self == .descending }
    var toggled: SortDirection { self == .ascending ? .descending : .ascending }
    var systemImage: String { self == .ascending ? "arrow.up" : "arrow.down" }
}

/// One group of songs in the library list.
struct LibrarySection: Identifiable {
    let id: String
    /// Header text; empty for the flat, header-less sorts.
    let title: String
    /// The A–Z index letter, or nil when this sort has no letters.
    let letter: String?
    let songs: [SongListItem]
}

enum LibrarySort {
    /// Group and sort `songs` for the active sort.
    static func sections(
        for songs: [SongListItem],
        sortKey: SortKey,
        direction: SortDirection
    ) -> [LibrarySection] {
        let descending = direction.isDescending

        switch sortKey {
        case .title, .artist:
            let pick: (SongListItem) -> String? = { sortKey == .artist ? $0.artist : $0.title }
            var groups: [String: [SongListItem]] = [:]
            for song in songs {
                groups[bucketLetter(pick(song)), default: []].append(song)
            }
            var letters = groups.keys.sorted()
            if descending { letters.reverse() }
            return letters.map { letter in
                var data = (groups[letter] ?? []).sorted { lhs, rhs in
                    // Artist sorts by artist first, then title as the tiebreak;
                    // title sorts by title alone.
                    if sortKey == .artist {
                        let comparison = (lhs.artist ?? "").localizedCompare(rhs.artist ?? "")
                        if comparison != .orderedSame { return comparison == .orderedAscending }
                    }
                    return byTitle(lhs, rhs)
                }
                if descending { data.reverse() }
                return LibrarySection(id: letter, title: letter, letter: letter, songs: data)
            }

        case .key:
            var groups: [String: [SongListItem]] = [:]
            for song in songs {
                groups[song.defaultKey ?? "", default: []].append(song)
            }
            var keys = groups.keys.sorted()
            if descending { keys.reverse() }
            return keys.map { key in
                LibrarySection(
                    id: key.isEmpty ? "__nokey" : key,
                    title: key.isEmpty ? "No key" : "Key of \(key)",
                    letter: nil,
                    songs: (groups[key] ?? []).sorted(by: byTitle)
                )
            }

        case .recent, .tempo:
            var data = songs
            if sortKey == .recent {
                // Ascending shows the most recently added first — mobile's default,
                // which reads as "newest" rather than as a date direction.
                data.sort { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            } else {
                // Numeric, nulls last.
                data.sort { ($0.tempo ?? Int.max) < ($1.tempo ?? Int.max) }
            }
            if descending { data.reverse() }
            return data.isEmpty ? [] : [LibrarySection(id: "__flat", title: "", letter: nil, songs: data)]
        }
    }

    /// First letter A–Z, or "#" for anything else (digits, punctuation, other
    /// scripts) — so "10,000 Reasons" and "‘Tis So Sweet" both bucket under "#".
    static func bucketLetter(_ value: String?) -> String {
        let first = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            .prefix(1).uppercased()
        guard let scalar = first.unicodeScalars.first,
              scalar >= "A", scalar <= "Z" else { return "#" }
        return first
    }

    static func byTitle(_ lhs: SongListItem, _ rhs: SongListItem) -> Bool {
        lhs.title.localizedCompare(rhs.title) == .orderedAscending
    }
}
