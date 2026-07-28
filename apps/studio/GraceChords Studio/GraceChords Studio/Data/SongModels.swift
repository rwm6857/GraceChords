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

/// Publication state of a row in `public.songs`.
///
/// Two cases, matching the `songs_status_check` constraint. `public.personal_songs`
/// has four ('draft','submitted','published','archived') because it feeds the
/// submission/review queue; this column deliberately does not.
enum SongStatus: String, Codable, Hashable, CaseIterable {
    case draft
    case published

    /// An unrecognised value decodes as `.published` rather than throwing. The
    /// column is NOT NULL DEFAULT 'published' and every pre-existing row is live
    /// content, so if a future migration adds a third state the failure mode is a
    /// song shown as published — not a library that refuses to decode.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SongStatus(rawValue: raw) ?? .published
    }
}

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
    /// Only editor+ ever receives `.draft` rows — the `songs_select` policy filters
    /// them out for everyone else, so a non-editor's list is published-only without
    /// the client asking for that.
    let status: SongStatus

    var isDraft: Bool { status == .draft }

    enum CodingKeys: String, CodingKey {
        case id, slug, title, artist, tags, tempo, status
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
    let status: SongStatus

    var isDraft: Bool { status == .draft }

    enum CodingKeys: String, CodingKey {
        case id, slug, title, artist, tempo, status
        case defaultKey = "default_key"
        case timeSignature = "time_signature"
        case chordproContent = "chordpro_content"
    }
}

/// Every authoring-relevant column of a song, for the editor.
///
/// Wider than `SongDetail` because the editor owns fields the viewer never reads
/// (tags, country, language, YouTube id, pptx url). Mirrors the column set
/// `packages/core/src/songs/songAuthoring.ts` maps to and from, so a song written
/// here and one written by the web editor carry the same fields.
struct SongEditable: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let artist: String?
    let defaultKey: String?
    let tempo: Int?
    let timeSignature: String?
    let country: String?
    let youtubeID: String?
    let language: String?
    let pptxURL: String?
    let tags: [String]?
    let chordproContent: String?
    let status: SongStatus

    enum CodingKeys: String, CodingKey {
        case id, slug, title, artist, tempo, country, language, tags, status
        case defaultKey = "default_key"
        case timeSignature = "time_signature"
        case youtubeID = "youtube_id"
        case pptxURL = "pptx_url"
        case chordproContent = "chordpro_content"
    }
}
