//
//  UserRepository.swift
//  GraceChords Studio
//
//  The signed-in account's role.
//
//  Native equivalent of `fetchUserRole` in packages/core/src/rbac/userRole.js —
//  same table, same column, same 'user' fallback — so the column name `role` lives
//  in one place per platform rather than being inlined at each call site. (The
//  live column was renamed from `global_role` to `role` at some point, and the
//  policies that inlined the old name had to be rewritten; see
//  supabase/migrations/20260522000000_advisor_hardening.sql.)
//
//  The role gates which sections of the UI appear. It is NOT the security boundary:
//  every write is independently gated by the `songs_insert` / `songs_update` /
//  `songs_delete` policies, so a tampered-with role in this process buys nothing.
//

import Foundation
import Supabase

struct UserRepository {
    let client: SupabaseClient

    private struct RoleRow: Decodable { let role: String? }

    /// The signed-in user's id, or nil when there is no session.
    ///
    /// Lives here rather than in the caller so that view models need no `import
    /// Supabase` — the target builds with SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY,
    /// under which reaching through `client.auth.session.user` requires importing
    /// both Supabase and Auth at the use site.
    func currentUserID() async -> String? {
        try? await client.auth.session.user.id.uuidString
    }

    /// The current user's role, or "user" when unauthenticated, absent, or
    /// unreadable.
    ///
    /// Never throws. A failure here would otherwise have to be handled at the shell
    /// level as a third state alongside signed-in and signed-out, and the only sane
    /// answer to "we could not read your role" is the least-privileged one — so it
    /// fails closed and returns "user".
    func fetchRole() async -> String {
        guard let userID = try? await client.auth.session.user.id else { return "user" }
        do {
            let rows: [RoleRow] = try await client
                .from("users")
                .select("role")
                .eq("id", value: userID)
                .limit(1)
                .execute()
                .value
            return rows.first?.role ?? "user"
        } catch {
            return "user"
        }
    }
}
