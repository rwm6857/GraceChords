//
//  AuthController.swift
//  GraceChords Studio
//
//  Session state for the app shell.
//
//  Session persistence needs no custom Keychain wrapper: supabase-swift's
//  AuthClient stores the session in the Keychain on Apple platforms and refreshes
//  it on its own. That is the native counterpart of the injected-storage contract
//  in packages/core/src/supabase/client.js (AsyncStorage on mobile, cookieStorage
//  on web) — the caller supplies the platform store, core/the client owns
//  persistence and refresh.
//

// `Combine` is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY, under which `ObservableObject`
// and `@Published` are not visible through a transitive import.
import Combine
import Foundation
import Supabase

@MainActor
final class AuthController: ObservableObject {
    enum Phase: Equatable {
        /// Checking for a persisted session — shown only briefly at launch.
        case loading
        case signedOut
        case signedIn
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var signedInEmail: String?
    @Published private(set) var isWorking = false
    @Published var errorText: String?

    /// The signed-in account's role from `public.users.role`, defaulting to the
    /// least-privileged value.
    ///
    /// Starts at and returns to "user" so no role-gated surface can appear during
    /// the window between a session being restored and the role being read — the
    /// gate opening for a moment and then closing would be worse than opening late.
    @Published private(set) var role = "user"

    private let client: SupabaseClient
    private let users: UserRepository

    init(client: SupabaseClient) {
        self.client = client
        self.users = UserRepository(client: client)
    }

    /// Restores any persisted session, then follows auth state for the lifetime of
    /// the window. Driven by SwiftUI's `.task`, so cancellation ends the stream.
    func observeAuthState() async {
        do {
            let session = try await client.auth.session
            apply(session: session)
            await refreshRole()
        } catch {
            // No stored session, or one that could not be refreshed — either way
            // the answer is the sign-in screen, not an error.
            phase = .signedOut
        }

        for await (event, session) in client.auth.authStateChanges {
            // Only `.signedOut` is matched by name; every other event is judged by
            // whether it carries a session, which keeps this independent of the
            // exact AuthChangeEvent case list.
            if case .signedOut = event {
                clear()
            } else if let session = session {
                let wasSignedIn = phase == .signedIn
                apply(session: session)
                // A token refresh fires this stream repeatedly for a session that
                // was already established; re-reading the role each time would be a
                // query per refresh for an answer that has not changed.
                if !wasSignedIn { await refreshRole() }
            } else {
                clear()
            }
        }
    }

    func signIn(email: String, password: String) async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            errorText = "Enter your email and password."
            return
        }

        isWorking = true
        errorText = nil
        do {
            _ = try await client.auth.signIn(email: trimmedEmail, password: password)
            // authStateChanges also reports this; setting it here means the UI does
            // not wait on the stream.
            phase = .signedIn
            signedInEmail = trimmedEmail
            await refreshRole()
        } catch {
            errorText = Self.message(for: error)
        }
        isWorking = false
    }

    func signOut() async {
        isWorking = true
        try? await client.auth.signOut()
        clear()
        isWorking = false
    }

    /// Called when a query reports a rejected token, so a session that expired
    /// out from under the UI lands on the sign-in screen instead of an error wall.
    func sessionExpired() {
        Task { await signOut() }
    }

    private func apply(session: Session) {
        signedInEmail = session.user.email
        phase = .signedIn
    }

    private func clear() {
        signedInEmail = nil
        role = "user"
        phase = .signedOut
    }

    /// Read the role for the current session.
    ///
    /// Called after the initial session check and after every sign-in, rather than
    /// lazily when a gated surface is first asked for — the shell needs the answer
    /// to decide whether that surface exists at all, and one query at sign-in is
    /// cheaper than making every gate check async.
    func refreshRole() async {
        guard phase == .signedIn else {
            role = "user"
            return
        }
        role = await users.fetchRole()
    }

    private static func message(for error: Error) -> String {
        let description = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        if description.lowercased().contains("invalid login credentials") {
            return "Incorrect email or password."
        }
        return description
    }
}
