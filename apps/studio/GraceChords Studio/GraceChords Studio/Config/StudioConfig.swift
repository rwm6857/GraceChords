//
//  StudioConfig.swift
//  GraceChords Studio
//
//  Supabase project URL + anon key for Studio.
//
//  These are the same public-safe client credentials apps/mobile and apps/web use
//  (EXPO_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL and the matching anon keys) —
//  RLS does the real enforcement. Both apps keep them in gitignored .env files,
//  so Studio follows suit: the committed constants below are empty placeholders.
//
//  Fill them in one of three ways, checked in this order:
//
//    1. Scheme environment variables — Product ▸ Scheme ▸ Edit Scheme ▸ Run ▸
//       Arguments ▸ Environment Variables: SUPABASE_URL and SUPABASE_ANON_KEY.
//    2. Info.plist keys of the same names (e.g. injected from an xcconfig).
//    3. The fallback constants at the bottom of this file — quickest, but do not
//       commit real values (`git update-index --skip-worktree` on this file keeps
//       local edits out of `git status`).
//
//  Missing config is surfaced as a readable screen, never a crash — the same
//  reasoning as apps/mobile's supabaseConfigError: a hard failure at startup
//  looks like an unexplained crash rather than a setup problem.
//

import Foundation

struct StudioConfig {
    let supabaseURL: URL
    let supabaseAnonKey: String
    /// Base URL of the web app's Pages Functions, which render PDF/JPG exports and
    /// relay Telegram pushes (`EXPO_PUBLIC_API_BASE_URL` on mobile).
    ///
    /// Optional on purpose: everything except Export works without it, so a missing
    /// value disables that one surface instead of gating the whole app behind a
    /// second piece of setup.
    let apiBaseURL: URL?

    enum ConfigError: LocalizedError {
        case missingValues([String])
        case invalidURL(String)

        var errorDescription: String? {
            switch self {
            case .missingValues(let names):
                return """
                Missing Supabase configuration: \(names.joined(separator: ", ")).

                Set them as scheme environment variables (Product ▸ Scheme ▸ Edit \
                Scheme ▸ Run ▸ Arguments), as Info.plist keys, or in the fallback \
                constants in Config/StudioConfig.swift.

                Use the same values as apps/mobile/.env \
                (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY). The \
                anon key is the public client key — never the service-role key.
                """
            case .invalidURL(let value):
                return "SUPABASE_URL is not a valid URL: \(value)"
            }
        }
    }

    static func resolve() -> Result<StudioConfig, ConfigError> {
        let urlString = value(for: "SUPABASE_URL", fallback: fallbackSupabaseURL)
        let anonKey = value(for: "SUPABASE_ANON_KEY", fallback: fallbackSupabaseAnonKey)

        var missing: [String] = []
        if urlString.isEmpty { missing.append("SUPABASE_URL") }
        if anonKey.isEmpty { missing.append("SUPABASE_ANON_KEY") }
        if !missing.isEmpty { return .failure(.missingValues(missing)) }

        guard let url = URL(string: urlString), url.scheme != nil, url.host != nil else {
            return .failure(.invalidURL(urlString))
        }

        // Trailing slash trimmed the way mobile's apiBase() does, so paths append
        // cleanly. An unparseable value is treated as absent rather than fatal.
        let apiBase = value(for: "API_BASE_URL", fallback: fallbackAPIBaseURL)
        let trimmedAPIBase = apiBase.hasSuffix("/") ? String(apiBase.dropLast()) : apiBase
        let apiBaseURL = trimmedAPIBase.isEmpty ? nil : URL(string: trimmedAPIBase)

        return .success(
            StudioConfig(supabaseURL: url, supabaseAnonKey: anonKey, apiBaseURL: apiBaseURL)
        )
    }

    private static func value(for name: String, fallback: String) -> String {
        if let fromEnvironment = ProcessInfo.processInfo.environment[name],
           !fromEnvironment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return fromEnvironment.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let fromPlist = Bundle.main.object(forInfoDictionaryKey: name) as? String,
           !fromPlist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return fromPlist.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return fallback.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Local fallbacks (do not commit real values)

    private static let fallbackSupabaseURL = ""
    private static let fallbackSupabaseAnonKey = ""
    /// e.g. "https://www.gracechords.com" — the canonical origin, not a
    /// redirecting one (mobile's apiError has a whole branch about that).
    private static let fallbackAPIBaseURL = ""
}
