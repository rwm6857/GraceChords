//
//  SongsRepository.swift
//  GraceChords Studio
//
//  Native equivalent of packages/core/src/songs/songsRepo.js — same table, same
//  columns, same filters, same ordering, so Studio sees exactly the rows
//  apps/mobile does.
//
//  Reads do not require a session: public.songs carries the policy `songs_select`,
//  which is `USING (is_deleted = false AND (status = 'published' OR
//  has_min_role('editor')))` with no role restriction on the published branch
//  (supabase/migrations/20260728000100_songs_status.sql). The app still gates its
//  UI behind sign-in, matching mobile, but a list that loads while auth is broken
//  is a config/network problem, not an auth one.
//
//  Draft filtering is NOT done here, on purpose. There is no `.eq("status", ...)`
//  anywhere in this file: the policy decides what a caller can see, so an editor's
//  list contains drafts and everyone else's does not, without the client asking.
//  Duplicating the rule client-side is how you end up with a filter that disagrees
//  with the policy — which is exactly the bug the 2026-07-28 consolidation
//  migration was written to fix (`songs_select USING (true)` had been silently
//  overriding the `is_deleted = false` that every query relied on).
//
//  Writes are editor+ per `songs_insert` / `songs_update` / `songs_delete`. A
//  non-editor's write is rejected by the database, not by this type — the UI gate
//  in ContentView is a courtesy, not the enforcement.
//

import Foundation
import Supabase

enum SongsRepositoryError: LocalizedError {
    /// The access token was rejected — the caller should return to sign-in.
    case sessionExpired
    /// A write was refused by row-level security. The UI gate should have prevented
    /// this, so it means the account's role is below editor or was changed mid-session.
    case notPermitted
    /// The slug collided despite `uniqueSlug(for:)` — two editors saving new songs
    /// with the same title at the same time is the realistic way this happens.
    case slugTaken
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .sessionExpired:
            return "Your session expired. Please sign in again."
        case .notPermitted:
            return """
            Your account does not have permission to change the song catalog. \
            Editing songs requires the editor role or higher.
            """
        case .slugTaken:
            return """
            Another song already uses this title's web address. \
            Change the title slightly and save again.
            """
        case .requestFailed(let message):
            return message
        }
    }
}

struct SongsRepository {
    /// Mirrors apps/mobile/src/lib/useSongList.ts COLUMNS, plus `status` so the
    /// library can badge a draft.
    private static let listColumns =
        "id, slug, title, artist, default_key, time_signature, tags, tempo, created_at, status"
    /// Mirrors core's fetchSongBySlug default columns, plus `status`.
    private static let detailColumns =
        "id, slug, title, artist, default_key, time_signature, tempo, chordpro_content, status"
    /// Every authoring-relevant column, for the editor. Mirrors the column set
    /// packages/core/src/songs/songAuthoring.ts maps to and from.
    private static let editableColumns =
        """
        id, slug, title, artist, default_key, tempo, time_signature, country, \
        youtube_id, language, pptx_url, tags, chordpro_content, status
        """

    let client: SupabaseClient

    /// The whole non-deleted catalog, title-ordered. Personal drafts
    /// (`personal_songs`, which mobile merges in) are not included yet.
    func fetchSongList() async throws -> [SongListItem] {
        do {
            let rows: [SongListItem] = try await client
                .from("songs")
                .select(Self.listColumns)
                .eq("is_deleted", value: false)
                .order("title")
                .execute()
                .value
            return rows
        } catch {
            throw Self.mapped(error)
        }
    }

    /// One song by slug, or nil when there is no match. `limit(1)` + first rather
    /// than `.single()`, so "not found" is a value instead of an error — the same
    /// contract as core's `maybeSingle()`.
    func fetchSong(slug: String) async throws -> SongDetail? {
        do {
            let rows: [SongDetail] = try await client
                .from("songs")
                .select(Self.detailColumns)
                .eq("slug", value: slug)
                .eq("is_deleted", value: false)
                .limit(1)
                .execute()
                .value
            return rows.first
        } catch {
            throw Self.mapped(error)
        }
    }

    // MARK: - Editing

    /// One song by id with every authoring column, or nil when there is no match.
    ///
    /// By id rather than slug because the editor can change the title, and a slug
    /// derived from the old title stops matching the moment it does.
    func fetchEditable(id: String) async throws -> SongEditable? {
        do {
            let rows: [SongEditable] = try await client
                .from("songs")
                .select(Self.editableColumns)
                .eq("id", value: id)
                .eq("is_deleted", value: false)
                .limit(1)
                .execute()
                .value
            return rows.first
        } catch {
            throw Self.mapped(error)
        }
    }

    /// Insert a new song and return the saved row.
    ///
    /// `slug` is resolved by the caller through `uniqueSlug(for:)`. `created_at` and
    /// `updated_at` are stamped here rather than left to the column defaults so an
    /// insert and an update take the same path through `SongWritePayload` — and
    /// because `songs` has no `update_updated_at` trigger (only `personal_songs`
    /// does), so nothing else would set `updated_at` on a later save.
    func insert(_ payload: SongWritePayload) async throws -> SongEditable {
        do {
            let rows: [SongEditable] = try await client
                .from("songs")
                .insert(payload)
                .select(Self.editableColumns)
                .execute()
                .value
            guard let saved = rows.first else {
                throw SongsRepositoryError.requestFailed("The song was not returned after saving.")
            }
            return saved
        } catch let error as SongsRepositoryError {
            throw error
        } catch {
            throw Self.mapped(error)
        }
    }

    /// Update an existing song by id and return the saved row.
    ///
    /// The payload deliberately carries no `status`, so saving an edit to a
    /// published song cannot un-publish it. Publication is moved only by
    /// `setStatus(id:to:)`, from an explicit Publish/Unpublish action.
    func update(id: String, with payload: SongWritePayload) async throws -> SongEditable {
        do {
            let rows: [SongEditable] = try await client
                .from("songs")
                .update(payload)
                .eq("id", value: id)
                .select(Self.editableColumns)
                .execute()
                .value
            guard let saved = rows.first else {
                // An editor+ caller whose UPDATE matches nothing means the row was
                // deleted underneath them — RLS returning zero rows and a missing
                // row are indistinguishable here, and both mean the same thing.
                throw SongsRepositoryError.requestFailed(
                    "This song no longer exists. It may have been deleted in another session."
                )
            }
            return saved
        } catch let error as SongsRepositoryError {
            throw error
        } catch {
            throw Self.mapped(error)
        }
    }

    /// Publish or unpublish, the only path that moves `status`.
    func setStatus(id: String, to status: SongStatus) async throws -> SongEditable {
        struct StatusPayload: Encodable {
            let status: String
            let updated_at: String
        }
        do {
            let rows: [SongEditable] = try await client
                .from("songs")
                .update(StatusPayload(status: status.rawValue, updated_at: Self.timestamp()))
                .eq("id", value: id)
                .select(Self.editableColumns)
                .execute()
                .value
            guard let saved = rows.first else {
                throw SongsRepositoryError.requestFailed(
                    "This song no longer exists. It may have been deleted in another session."
                )
            }
            return saved
        } catch let error as SongsRepositoryError {
            throw error
        } catch {
            throw Self.mapped(error)
        }
    }

    /// Permanently delete a song. There is no recovery step.
    ///
    /// A genuine `DELETE`, not the `is_deleted = true` soft delete apps/web and
    /// apps/mobile perform — so it also cascades: `setlist_songs.song_id` and
    /// `user_starred_songs.song_id` are both `ON DELETE CASCADE`, meaning the song
    /// leaves every personal and team setlist and every favourites list along with
    /// it. `editor_audit_log.song_id` is `ON DELETE SET NULL`, so an audit row
    /// written before the delete survives with its `song_slug` / `song_title` text
    /// intact — which is why `SongEditorModel` writes it first.
    func delete(id: String) async throws {
        do {
            try await client
                .from("songs")
                .delete()
                .eq("id", value: id)
                .execute()
        } catch {
            throw Self.mapped(error)
        }
    }

    /// A slug that no other row holds, mirroring core's `deriveUniqueSlug`:
    /// `_2`, `_3`… appended until free, with `currentID`'s own row not counting as
    /// a collision so re-saving keeps its slug.
    ///
    /// Returns nil when the title yields no slug at all (no alphanumerics), which
    /// core signals with '' — `songs.slug` is UNIQUE NOT NULL, so the caller must
    /// refuse the write rather than insert an empty slug.
    func uniqueSlug(for title: String, bridge: CoreBridge, currentID: String? = nil) async throws -> String? {
        let base = try bridge.slugify(title)
        guard !base.isEmpty else { return nil }

        var candidate = base
        var suffix = 2
        // Same bounded guard as core: a title colliding a thousand times bails out
        // rather than looping forever.
        for _ in 0..<1000 {
            let rows: [SlugProbe]
            do {
                rows = try await client
                    .from("songs")
                    .select("id")
                    .eq("slug", value: candidate)
                    .limit(1)
                    .execute()
                    .value
            } catch {
                throw Self.mapped(error)
            }
            guard let existing = rows.first else { return candidate }
            if existing.id == currentID { return candidate }
            candidate = "\(base)_\(suffix)"
            suffix += 1
        }
        return candidate
    }

    /// Best-effort `editor_audit_log` row, matching core's `writeAuditLog`.
    ///
    /// Failures are the caller's to swallow: the log is a record of an action, and
    /// losing the record must never be the reason the action itself fails.
    func writeAuditLog(_ entry: EditorAuditEntry) async throws {
        do {
            try await client.from("editor_audit_log").insert(entry).execute()
        } catch {
            throw Self.mapped(error)
        }
    }

    private struct SlugProbe: Decodable { let id: String }

    /// ISO-8601 with fractional seconds, matching JavaScript's `toISOString()` so
    /// rows written by Studio sort identically to rows written by web and mobile.
    static func timestamp(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    /// Recognise a rejected token without depending on a specific error type from
    /// supabase-swift: PostgREST reports an expired/invalid JWT as PGRST301, and
    /// GoTrue phrases it in the message. Matching on text keeps this working
    /// across client versions; the cost of a false positive is one extra sign-in.
    ///
    /// The write-side codes are recognised the same way and for the same reason:
    /// 42501 is Postgres's "new row violates row-level security policy" (an INSERT
    /// the `songs_insert` policy refused), and 23505 is a unique-constraint
    /// violation, which on this table means the slug.
    private static func mapped(_ error: Error) -> SongsRepositoryError {
        let description = "\(error)".lowercased()
        if description.contains("42501") || description.contains("row-level security") {
            return .notPermitted
        }
        if description.contains("23505")
            || description.contains("songs_slug_idx")
            || description.contains("duplicate key value") {
            return .slugTaken
        }
        let looksLikeAuthFailure =
            description.contains("pgrst301")
            || description.contains("jwt expired")
            || description.contains("invalid jwt")
            || description.contains("token is expired")
        if looksLikeAuthFailure { return .sessionExpired }
        return .requestFailed((error as? LocalizedError)?.errorDescription ?? "\(error)")
    }
}
