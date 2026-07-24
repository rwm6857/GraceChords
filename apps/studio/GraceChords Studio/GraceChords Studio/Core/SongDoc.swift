//
//  SongDoc.swift
//  GraceChords Studio
//
//  Swift mirrors of packages/core/src/chordpro/types.ts — the structure
//  parseChordProOrLegacy returns. Field names and optionality follow the TS
//  types exactly; JSON.stringify omits `undefined`, so anything optional there is
//  optional here.
//
//  Keep in sync with types.ts. If a field is added there, add it here.
//

import Foundation

/// A chord symbol and the UTF-16 offset into `SongLine.lyrics` where it sits.
struct ChordPlacement: Codable, Hashable {
    let sym: String
    let index: Int
}

struct InstrumentalDirective: Codable, Hashable {
    let chords: [String]
    /// `repeat` in the TS type; renamed because `repeat` is a Swift keyword.
    let repeatCount: Int?

    enum CodingKeys: String, CodingKey {
        case chords
        case repeatCount = "repeat"
    }
}

struct SongLine: Codable, Hashable {
    let lyrics: String
    let chords: [ChordPlacement]
    let comment: String?
    let instrumental: InstrumentalDirective?
}

struct SongSection: Codable, Hashable {
    /// 'verse', 'chorus', 'bridge', 'comment', 'instrumental', …
    let kind: String
    let label: String?
    let lines: [SongLine]
    let instrumental: InstrumentalDirective?
}

struct SongMeta: Codable, Hashable {
    let title: String?
    let key: String?
    let capo: Int?
    /// Any directive that is not title/key/capo, lower-cased keys.
    let meta: [String: String]?
}

struct SongLayoutHints: Codable, Hashable {
    let requestedColumns: Int?
    let columnBreakAfter: [Int]?
}

struct ChordDefine: Codable, Hashable {
    let name: String
    let raw: String
}

struct SongDoc: Codable, Hashable {
    let meta: SongMeta
    let sections: [SongSection]
    let layoutHints: SongLayoutHints?
    let chordDefs: [ChordDefine]?
}
