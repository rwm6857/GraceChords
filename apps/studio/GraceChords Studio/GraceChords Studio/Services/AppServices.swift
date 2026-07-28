//
//  AppServices.swift
//  GraceChords Studio
//
//  One Supabase client, one songs repository, one JavaScriptCore bridge, built
//  once per launch.
//
//  A bridge that fails to load is not fatal: the library still works and the
//  viewer shows the reason, so a missing/broken JS bundle cannot take the app down.
//

import Foundation
import Supabase

final class AppServices {
    let client: SupabaseClient
    let songs: SongsRepository
    let users: UserRepository
    let export: ExportService
    let bridge: CoreBridge?
    let bridgeErrorText: String?

    init(config: StudioConfig) {
        // `emitLocalSessionAsInitialSession: true` opts in to what supabase-swift will
        // do by default in its next major version, and silences the runtime notice it
        // logs until you do. Under the old behaviour `.initialSession` carried a
        // session only after a refresh had been attempted; under the new one the
        // stored session is emitted as-is, expired or not, with a `tokenRefreshed` or
        // `signOut` to follow.
        //
        // Opting in is only safe because AuthController skips expired sessions — it
        // judges events by whether one carries a session, so without that guard this
        // flag would let a dead token flip the app to signed-in. Change the two
        // together or neither.
        //
        // The storage argument is omitted deliberately: this initializer defaults it
        // to `AuthClient.Configuration.defaultLocalStorage`, the same Keychain store
        // the no-options initializer used, so session persistence is unchanged.
        let client = SupabaseClient(
            supabaseURL: config.supabaseURL,
            supabaseKey: config.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(emitLocalSessionAsInitialSession: true)
            )
        )
        self.client = client
        self.songs = SongsRepository(client: client)
        self.users = UserRepository(client: client)
        self.export = ExportService(client: client, apiBaseURL: config.apiBaseURL)

        do {
            self.bridge = try CoreBridge()
            self.bridgeErrorText = nil
        } catch {
            self.bridge = nil
            self.bridgeErrorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }
}
