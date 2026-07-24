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
    let bridge: CoreBridge?
    let bridgeErrorText: String?

    init(config: StudioConfig) {
        let client = SupabaseClient(
            supabaseURL: config.supabaseURL,
            supabaseKey: config.supabaseAnonKey
        )
        self.client = client
        self.songs = SongsRepository(client: client)

        do {
            self.bridge = try CoreBridge()
            self.bridgeErrorText = nil
        } catch {
            self.bridge = nil
            self.bridgeErrorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }
}
