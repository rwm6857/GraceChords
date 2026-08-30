//
//  DraftStore.swift
//  GraceChords Studio
//
//  Unsaved editor work, on disk, so quitting does not lose it.
//
//  The unsaved-changes guard (Manage/EditorSession.swift) was only ever the reliable
//  half of this: it catches every way *out of the editor*, but nothing about a crash,
//  a force quit, or a power loss. This is the other half — a body being typed is
//  written to disk a moment after the typing stops, and read back when that song is
//  opened again.
//
//  **The draft is not the truth and never overwrites the server on its own.** It is
//  restored into `form` only, leaving `savedForm` as the row Supabase returned, so
//  `isDirty` stays honest and the restored text is unsaved work that still has to be
//  saved deliberately. That is also why there is no "auto-save to Supabase": Studio
//  has no review step, and a background write that publishes a half-typed lyric to
//  every worshipper's library is exactly the failure this must not have.
//
//  **Keyed by what the editor is open on**, matching `EditorSession.Target.id`: a
//  song's id, or the literal `new` for the blank draft that has no row yet. There is
//  therefore one recoverable new-song draft at a time, which is also all the editor
//  can hold — `ManageSongsView` replaces the model when you start another.
//
//  **A draft that cannot be decoded is deleted, not repaired.** Restoring a
//  half-understood form would put fields the writer never typed into a song they are
//  about to publish. Losing a recovered draft is a bad day; silently inventing
//  content is worse. The same rule covers a snapshot from a future build.
//

import Foundation

/// One editor's unsaved state at a moment in time.
struct SongDraftSnapshot: Codable, Equatable, Sendable {
    /// Bumped only when a change would make an older snapshot decode into something
    /// *wrong* rather than merely incomplete — adding a field does not need it, since
    /// `SongForm`'s decoder fills absent fields with their blank values.
    static let currentVersion = 1

    var version: Int = SongDraftSnapshot.currentVersion
    /// `EditorSession.Target.id` — a song id, or `new`.
    var key: String
    var form: SongForm
    var savedAt: Date
}

/// Reads and writes draft snapshots under Application Support.
///
/// A struct with an injectable directory rather than a singleton with a hardcoded
/// path, so the tests get a temporary directory instead of reaching into the real
/// container and deleting somebody's recovered work.
struct DraftStore: Sendable {
    let directory: URL

    /// The app's own drafts folder. Inside the sandbox container, which is what makes
    /// it private to Studio without any entitlement.
    static func applicationSupport() -> DraftStore {
        let base = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return DraftStore(directory: base.appendingPathComponent("Drafts", isDirectory: true))
    }

    // MARK: - Reading

    func read(key: String) -> SongDraftSnapshot? {
        guard let url = fileURL(for: key) else { return nil }
        guard let data = try? Data(contentsOf: url) else { return nil }
        guard let snapshot = try? JSONDecoder.draft.decode(SongDraftSnapshot.self, from: data),
              snapshot.version <= SongDraftSnapshot.currentVersion else {
            // Unreadable or from a newer build: drop it rather than guess at it.
            clear(key: key)
            return nil
        }
        return snapshot
    }

    // MARK: - Writing

    @discardableResult
    func write(_ snapshot: SongDraftSnapshot) -> Bool {
        guard let url = fileURL(for: snapshot.key) else { return false }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let data = try JSONEncoder.draft.encode(snapshot)
            // Atomic: a draft half-written when the power goes is the one case where
            // this whole file would have made things worse instead of better.
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            // A draft that cannot be written is not worth interrupting typing over.
            // The editor's guard still catches every ordinary way out.
            return false
        }
    }

    func clear(key: String) {
        guard let url = fileURL(for: key) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - Paths

    /// One file per key. The key is a UUID or the literal `new`, but it arrives from
    /// a row id rather than from this file's own constants, so it is filtered to
    /// characters that cannot walk out of the directory or name a hidden file.
    func fileURL(for key: String) -> URL? {
        let safe = key.filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
        guard !safe.isEmpty else { return nil }
        return directory.appendingPathComponent("\(safe).json", isDirectory: false)
    }
}

// MARK: - Coders

private extension JSONEncoder {
    static let draft: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

private extension JSONDecoder {
    static let draft: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
