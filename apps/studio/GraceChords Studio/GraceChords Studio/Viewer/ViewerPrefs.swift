//
//  ViewerPrefs.swift
//  GraceChords Studio
//
//  Per-song viewer preferences — today just the column mode, as in
//  apps/mobile/src/lib/viewerPrefs.ts.
//
//  Resolution is per-song override → app-wide default → single, and storage stays
//  lean: only overrides that differ from the resolved default are kept, and the
//  key is removed entirely when nothing remains. Both rules are mobile's, ported
//  so the two apps behave the same when a song is opened, changed and reopened.
//
//  Device-local (UserDefaults), NOT Supabase-synced.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import Foundation

/// How many columns the chart is laid out in. `double` is offered only when the
/// window is wide enough to make it readable.
enum ColumnMode: String, CaseIterable, Codable, Sendable {
    case single
    case double

    var label: String { self == .single ? "1" : "2" }
}

@MainActor
final class ViewerPrefs: ObservableObject {
    static let shared = ViewerPrefs()

    /// v1 in the key because the stored shape is a dictionary of overrides; a
    /// future shape change gets a new key rather than a migration.
    private static let storageKey = "gc.viewer.columnMode.v1"

    static let defaultColumnMode: ColumnMode = .single

    /// Bumped on every write so SwiftUI views observing this store re-read. The
    /// overrides themselves are not published — callers ask by slug.
    @Published private(set) var revision = 0

    // Spelled out rather than `Self.` — a covariant `Self` cannot be referenced
    // from a stored property initializer.
    private var appDefault: ColumnMode = ViewerPrefs.defaultColumnMode
    private var overrides: [String: ColumnMode] = [:]
    private let store: UserDefaults

    init(store: UserDefaults = .standard) {
        self.store = store
        load()
    }

    /// Resolved column mode for a song: per-song override → app default → single.
    func columnMode(for slug: String?) -> ColumnMode {
        guard let slug = slug else { return appDefault }
        return overrides[slug] ?? appDefault
    }

    /// Persist a song's column mode. Setting a song back to the resolved default
    /// removes its override instead of storing a redundant entry.
    func setColumnMode(_ mode: ColumnMode, for slug: String) {
        guard !slug.isEmpty, columnMode(for: slug) != mode else { return }
        if mode == appDefault {
            overrides.removeValue(forKey: slug)
        } else {
            overrides[slug] = mode
        }
        revision += 1
        persist()
    }

    // MARK: - Storage

    private func load() {
        guard let raw = store.dictionary(forKey: Self.storageKey) else { return }
        if let stored = raw["default"] as? String, let mode = ColumnMode(rawValue: stored) {
            appDefault = mode
        }
        guard let songs = raw["songs"] as? [String: String] else { return }
        for (slug, value) in songs {
            // Drop anything unrecognised, and anything equal to the default — the
            // same pruning mobile's parse() applies on read.
            guard let mode = ColumnMode(rawValue: value), mode != appDefault else { continue }
            overrides[slug] = mode
        }
    }

    private func persist() {
        guard !overrides.isEmpty || appDefault != Self.defaultColumnMode else {
            store.removeObject(forKey: Self.storageKey)
            return
        }
        var payload: [String: Any] = [
            "songs": overrides.mapValues(\.rawValue),
        ]
        if appDefault != Self.defaultColumnMode { payload["default"] = appDefault.rawValue }
        store.set(payload, forKey: Self.storageKey)
    }
}
