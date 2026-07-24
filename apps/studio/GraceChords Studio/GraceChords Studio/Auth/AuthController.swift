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

    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    /// Restores any persisted session, then follows auth state for the lifetime of
    /// the window. Driven by SwiftUI's `.task`, so cancellation ends the stream.
    func observeAuthState() async {
        do {
            let session = try await client.auth.session
            apply(session: session)
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
                apply(session: session)
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
        phase = .signedOut
    }

    private static func message(for error: Error) -> String {
        let description = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        if description.lowercased().contains("invalid login credentials") {
            return "Incorrect email or password."
        }
        return description
    }
}
