//
//  SongWritePayload.swift
//  GraceChords Studio
//
//  What Studio sends to `public.songs` on an insert or an update, and the
//  `editor_audit_log` row that accompanies it.
//
//  Swift equivalent of `formToSongRow` in packages/core/src/songs/songAuthoring.ts:
//  the same columns, and the same empty-string-to-NULL coalescing, so a song saved
//  from Studio is indistinguishable from one saved by the web editor.
//
//  Properties are named exactly as the columns are, so no CodingKeys are needed —
//  and unlike the Decodable row models, an accidental rename here would be a write
//  to a column that does not exist rather than a field that silently stays nil.
//

import Foundation

struct SongWritePayload: Encodable {
    let title: String
    let artist: String?
    let default_key: String?
    let tempo: Int?
    let time_signature: String?
    let country: String?
    let youtube_id: String?
    let language: String?
    let pptx_url: String?
    let tags: [String]
    let chordpro_content: String
    let slug: String
    let is_deleted: Bool
    let updated_at: String
    /// Only set on an insert. `nil` is skipped by the encoder below, so an update
    /// never rewrites the creation time.
    let created_at: String?
    /// Only set on an insert — a new song is always a draft. Deliberately absent on
    /// an update, which is what makes "saving an edit cannot un-publish a song" a
    /// property of the payload rather than a rule the UI has to remember.
    let status: String?

    /// `encodeIfPresent` throughout: PostgREST treats a key present with a JSON
    /// null as "set this column to NULL", so encoding `created_at: nil` on an
    /// update would wipe the creation timestamp rather than leave it alone. The
    /// nullable *content* columns are encoded unconditionally, because there
    /// clearing a field back to NULL is exactly what the user asked for.
    enum CodingKeys: String, CodingKey {
        case title, artist, default_key, tempo, time_signature, country
        case youtube_id, language, pptx_url, tags, chordpro_content, slug
        case is_deleted, updated_at, created_at, status
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(artist, forKey: .artist)
        try container.encode(default_key, forKey: .default_key)
        try container.encode(tempo, forKey: .tempo)
        try container.encode(time_signature, forKey: .time_signature)
        try container.encode(country, forKey: .country)
        try container.encode(youtube_id, forKey: .youtube_id)
        try container.encode(language, forKey: .language)
        try container.encode(pptx_url, forKey: .pptx_url)
        try container.encode(tags, forKey: .tags)
        try container.encode(chordpro_content, forKey: .chordpro_content)
        try container.encode(slug, forKey: .slug)
        try container.encode(is_deleted, forKey: .is_deleted)
        try container.encode(updated_at, forKey: .updated_at)
        try container.encodeIfPresent(created_at, forKey: .created_at)
        try container.encodeIfPresent(status, forKey: .status)
    }
}

extension SongWritePayload {
    /// Build the payload from editor state.
    ///
    /// `isInsert` decides the two write-once fields: a new row gets `created_at`
    /// and `status = 'draft'`; an existing row gets neither, so its publication
    /// state and creation time survive the save untouched.
    init(form: SongForm, slug: String, isInsert: Bool, now: String = SongsRepository.timestamp()) {
        self.title = form.title.trimmed
        self.artist = form.artist.nilIfBlank
        self.default_key = form.defaultKey.nilIfBlank
        self.tempo = form.tempoValue
        self.time_signature = form.timeSignature.nilIfBlank
        self.country = form.country.nilIfBlank
        self.youtube_id = form.youtubeID.nilIfBlank
        self.language = form.language.nilIfBlank
        self.pptx_url = form.pptxURL.nilIfBlank
        self.tags = form.tags
        // Coalesced to "" rather than NULL, matching core's note that the live
        // column is NOT NULL — saving an empty body must not violate it.
        self.chordpro_content = form.chordproContent
        self.slug = slug
        self.is_deleted = false
        self.updated_at = now
        self.created_at = isInsert ? now : nil
        self.status = isInsert ? SongStatus.draft.rawValue : nil
    }
}

/// A row for `public.editor_audit_log`, matching core's `writeAuditLog`.
///
/// `action` is a plain String because the table's CHECK constraint owns the
/// vocabulary ('direct_save', 'suggestion_submitted', 'approved', 'rejected',
/// 'deleted', 'touched_up'); `EditorAuditEntry.Action` below covers the two Studio
/// actually writes.
struct EditorAuditEntry: Encodable {
    enum Action: String {
        case directSave = "direct_save"
        case deleted
    }

    let actor_id: String?
    let action: String
    /// Null for a delete, so the log row survives the `ON DELETE SET NULL` FK.
    let song_id: String?
    let song_slug: String?
    let song_title: String?
    let note: String?

    init(action: Action, actorID: String?, songID: String?, slug: String?, title: String?, note: String? = nil) {
        self.actor_id = actorID
        self.action = action.rawValue
        self.song_id = songID
        self.song_slug = slug
        self.song_title = title
        self.note = note
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Trimmed, or nil when nothing is left — core's `form.field || null`.
    var nilIfBlank: String? {
        let value = trimmed
        return value.isEmpty ? nil : value
    }
}
