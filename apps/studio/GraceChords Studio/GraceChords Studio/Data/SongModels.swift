//
//  SongModels.swift
//  GraceChords Studio
//
//  Rows of public.songs, shaped to match what packages/core's songsRepo.js selects
//  (plus the columns apps/mobile's library widens the list query with). Column
//  names are snake_case in Postgres and PostgREST's decoder does no key
//  conversion, hence the explicit CodingKeys.
//
//  `created_at` stays a String: nothing here formats or compares dates, and
//  keeping it opaque avoids depending on PostgREST's date-decoding strategy.
//

import Foundation

/// A library row — everything except the ChordPro body.
struct SongListItem: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let artist: String?
    let defaultKey: String?
    let timeSignature: String?
    let tags: [String]?
    let tempo: Int?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, slug, title, artist, tags, tempo
        case defaultKey = "default_key"
        case timeSignature = "time_signature"
        case createdAt = "created_at"
    }
}

/// A single song including its renderable body.
struct SongDetail: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let artist: String?
    let defaultKey: String?
    let timeSignature: String?
    let tempo: Int?
    let chordproContent: String?

    enum CodingKeys: String, CodingKey {
        case id, slug, title, artist, tempo
        case defaultKey = "default_key"
        case timeSignature = "time_signature"
        case chordproContent = "chordpro_content"
    }
}
