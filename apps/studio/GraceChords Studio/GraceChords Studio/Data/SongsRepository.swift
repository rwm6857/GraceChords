//
//  SongsRepository.swift
//  GraceChords Studio
//
//  Native equivalent of packages/core/src/songs/songsRepo.js — same table, same
//  columns, same filters, same ordering, so Studio sees exactly the rows
//  apps/mobile does.
//
//  Reads do not require a session: public.songs carries the policy
//  "Songs are publicly readable" — `for select using (is_deleted = false)` with no
//  role restriction (supabase/migrations/20260305_songs_migration.sql). The app
//  still gates its UI behind sign-in, matching mobile, but a list that loads while
//  auth is broken is a config/network problem, not an auth one.
//

import Foundation
import Supabase

enum SongsRepositoryError: LocalizedError {
    /// The access token was rejected — the caller should return to sign-in.
    case sessionExpired
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .sessionExpired:
            return "Your session expired. Please sign in again."
        case .requestFailed(let message):
            return message
        }
    }
}

struct SongsRepository {
    /// Mirrors apps/mobile/src/lib/useSongList.ts COLUMNS.
    private static let listColumns =
        "id, slug, title, artist, default_key, time_signature, tags, tempo, created_at"
    /// Mirrors core's fetchSongBySlug default columns.
    private static let detailColumns =
        "id, slug, title, artist, default_key, time_signature, tempo, chordpro_content"

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

    /// Recognise a rejected token without depending on a specific error type from
    /// supabase-swift: PostgREST reports an expired/invalid JWT as PGRST301, and
    /// GoTrue phrases it in the message. Matching on text keeps this working
    /// across client versions; the cost of a false positive is one extra sign-in.
    private static func mapped(_ error: Error) -> SongsRepositoryError {
        let description = "\(error)".lowercased()
        let looksLikeAuthFailure =
            description.contains("pgrst301")
            || description.contains("jwt expired")
            || description.contains("invalid jwt")
            || description.contains("token is expired")
        if looksLikeAuthFailure { return .sessionExpired }
        return .requestFailed((error as? LocalizedError)?.errorDescription ?? "\(error)")
    }
}
