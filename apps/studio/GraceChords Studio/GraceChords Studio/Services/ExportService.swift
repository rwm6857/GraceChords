//
//  ExportService.swift
//  GraceChords Studio
//
//  Server-rendered export and Telegram delivery, against the same web Pages
//  Functions apps/mobile calls: POST /api/export/song and POST /api/telegram/push.
//
//  Ports apps/mobile/src/lib/api.ts, exportSong.ts and telegramPush.ts — including
//  api.ts's redirect retry: if the configured base redirects (apex → www), URLSession
//  follows it but turns the POST into a GET per spec and the API answers 405, so a
//  redirected 405 is retried once against the final origin.
//
//  Rendering stays on the server deliberately. The same pure pdf_mvp engine backs
//  web, mobile and Studio, so a chart exported from any of them is byte-identical;
//  a native Swift renderer would be a fourth implementation to keep in step.
//

import Foundation
import Supabase

enum ExportFormat: String, CaseIterable, Sendable {
    case pdf
    case jpg

    var displayName: String { self == .pdf ? "PDF" : "JPG" }
    var systemImage: String { self == .pdf ? "doc.richtext" : "photo" }
}

enum ExportError: LocalizedError {
    case notConfigured
    case notSignedIn
    /// The server has no rasteriser available; the caller should offer PDF instead.
    case imageUnavailable
    case redirectingBaseURL
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return """
            Export is not configured. Set API_BASE_URL as a scheme environment \
            variable to the web app's canonical origin — the same value \
            apps/mobile/.env uses for EXPO_PUBLIC_API_BASE_URL.
            """
        case .notSignedIn:
            return "Sign in again to export songs."
        case .imageUnavailable:
            return "An image of this song isn't available right now. Try exporting a PDF instead."
        case .redirectingBaseURL:
            return """
            The API rejected the request (405) — API_BASE_URL likely points at a \
            redirecting domain. Set it to the canonical one (e.g. \
            https://www.gracechords.com).
            """
        case .failed(let message):
            return message
        }
    }
}

/// Result of a Telegram push, mirroring mobile's `'sent' | 'not_linked'`.
enum TelegramPushResult {
    case sent
    case notLinked
}

struct ExportService {
    static let telegramBotURL = URL(string: "https://t.me/gracechords_bot")!

    let client: SupabaseClient
    let apiBaseURL: URL?

    var isConfigured: Bool { apiBaseURL != nil }

    /// A rendered song: the bytes plus the filename the server suggested, ready for
    /// a save panel or the share sheet.
    struct ExportedFile {
        let data: Data
        let filename: String
    }

    func exportSong(songID: String, key: String, format: ExportFormat) async throws -> ExportedFile {
        let (data, response) = try await post(
            "/api/export/song",
            body: ["song_id": songID, "key": key, "format": format.rawValue]
        )

        // 501 = server rasteriser unavailable.
        if response.statusCode == 501 { throw ExportError.imageUnavailable }
        try throwIfFailed(response, data: data, fallback: "export_failed")

        let contentType = response.value(forHTTPHeaderField: "Content-Type") ?? ""
        let fallbackExtension = contentType.contains("pdf") ? "pdf" : "png"
        let disposition = response.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        let filename = Self.filename(fromContentDisposition: disposition)
            ?? "song-export.\(fallbackExtension)"
        return ExportedFile(data: data, filename: filename)
    }

    func pushSongToTelegram(songID: String, key: String) async throws -> TelegramPushResult {
        let (data, response) = try await post(
            "/api/telegram/push",
            body: ["items": [["song_id": songID, "key": key]], "context": "song"]
        )
        if response.statusCode == 409 { return .notLinked }
        try throwIfFailed(response, data: data, fallback: "telegram_failed")
        return .sent
    }

    // MARK: - Transport

    private func post(_ path: String, body: [String: Any]) async throws -> (Data, HTTPURLResponse) {
        guard let base = apiBaseURL else { throw ExportError.notConfigured }
        guard let accessToken = try? await client.auth.session.accessToken else {
            throw ExportError.notSignedIn
        }
        let payload = try JSONSerialization.data(withJSONObject: body)

        var (data, response) = try await send(url: base.appendingPathComponent(path.trimmedLeadingSlash),
                                              token: accessToken, payload: payload)

        // Redirected POST → GET → 405: retry once against the final origin.
        if response.statusCode == 405,
           let finalURL = response.url,
           let finalOrigin = finalURL.origin,
           finalOrigin != base.origin,
           let retryURL = URL(string: finalOrigin + path) {
            (data, response) = try await send(url: retryURL, token: accessToken, payload: payload)
        }
        return (data, response)
    }

    private func send(url: URL, token: String, payload: Data) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = payload
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ExportError.failed("The server sent an unexpected response.")
        }
        return (data, http)
    }

    /// Reads the API's `{ error }` body into a message, with mobile's targeted hint
    /// for the redirect case a retry could not fix.
    private func throwIfFailed(_ response: HTTPURLResponse, data: Data, fallback: String) throws {
        guard !(200..<300).contains(response.statusCode) else { return }
        if response.statusCode == 405 { throw ExportError.redirectingBaseURL }
        let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        if let message = parsed?["error"] as? String, !message.isEmpty {
            throw ExportError.failed(message)
        }
        throw ExportError.failed("\(fallback)_\(response.statusCode)")
    }

    private static func filename(fromContentDisposition disposition: String) -> String? {
        guard let range = disposition.range(
            of: "filename=\"[^\"]+\"", options: .regularExpression) else { return nil }
        let match = disposition[range]
        return String(match.dropFirst("filename=\"".count).dropLast())
    }
}

private extension String {
    var trimmedLeadingSlash: String { hasPrefix("/") ? String(dropFirst()) : self }
}

private extension URL {
    /// scheme://host[:port], for comparing against a redirect's destination.
    var origin: String? {
        guard let scheme = scheme, let host = host else { return nil }
        if let port = port { return "\(scheme)://\(host):\(port)" }
        return "\(scheme)://\(host)"
    }
}
