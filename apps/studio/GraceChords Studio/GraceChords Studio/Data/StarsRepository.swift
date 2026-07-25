//
//  StarsRepository.swift
//  GraceChords Studio
//
//  Favorites, backed by `user_starred_songs` (song_id + user_id, RLS-scoped to the
//  signed-in user). Port of the data half of apps/mobile/src/lib/useSongStar.ts —
//  same table, same columns, same conflict target, so a song starred on the phone
//  reads as starred here.
//
//  Unlike the catalog, this table is per-user and therefore needs a session: RLS
//  gives an anonymous caller nothing.
//

import Foundation
import Supabase

struct StarsRepository {
    private static let table = "user_starred_songs"

    let client: SupabaseClient

    /// Row shape for the insert. Encodable rather than a dictionary so PostgREST
    /// gets the column names spelled once.
    private struct StarRow: Encodable {
        let userID: String
        let songID: String

        enum CodingKeys: String, CodingKey {
            case userID = "user_id"
            case songID = "song_id"
        }
    }

    private struct StarKey: Decodable {
        let songID: String
        enum CodingKeys: String, CodingKey { case songID = "song_id" }
    }

    /// Whether the signed-in user has starred this song. False when there is no
    /// session — the star is simply not offered rather than erroring.
    func isStarred(songID: String) async throws -> Bool {
        guard let userID = try? await client.auth.session.user.id.uuidString.lowercased() else {
            return false
        }
        let rows: [StarKey] = try await client
            .from(Self.table)
            .select("song_id")
            .eq("user_id", value: userID)
            .eq("song_id", value: songID)
            .limit(1)
            .execute()
            .value
        return !rows.isEmpty
    }

    /// Star the song. Upsert on the composite key so double-starring is a no-op
    /// rather than a duplicate-key error, matching mobile's `onConflict`.
    func star(songID: String) async throws {
        let userID = try await client.auth.session.user.id.uuidString.lowercased()
        try await client
            .from(Self.table)
            .upsert(StarRow(userID: userID, songID: songID), onConflict: "user_id,song_id")
            .execute()
    }

    func unstar(songID: String) async throws {
        let userID = try await client.auth.session.user.id.uuidString.lowercased()
        try await client
            .from(Self.table)
            .delete()
            .eq("user_id", value: userID)
            .eq("song_id", value: songID)
            .execute()
    }
}
