//
//  StudioDefaults.swift
//  GraceChords Studio
//
//  App-wide preferences that outlive a window: the ones apps/mobile keeps in
//  src/lib/defaults.ts (chord style, keep-awake) and src/lib/autoHideChrome.ts
//  (hide controls when idle).
//
//  Storage is UserDefaults — the macOS counterpart of mobile's AsyncStorage.
//  Device-local, NOT Supabase-synced, exactly as on mobile. The keys are mobile's
//  verbatim so the two stores stay recognisably the same preference; nothing reads
//  across platforms, so they cannot actually collide.
//
//  Everything else in the Viewer (transpose, font size, show-chords,
//  show-sections, accidental) is deliberately session-ephemeral, matching
//  mobile's useState — see ViewerOptions.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import Foundation
import SwiftUI

/// Appearance preference. Mirrors mobile's `ThemePref` — `system` follows the OS,
/// light/dark force a mode — and shares its stored values so the two apps mean the
/// same thing by the same string.
enum ThemePreference: String, CaseIterable, Identifiable, Sendable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    /// nil follows the OS, which is exactly what a nil `preferredColorScheme` means.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

@MainActor
final class StudioDefaults: ObservableObject {
    /// One store per process. The Viewer, the library and any future Settings
    /// surface all observe this instance, so a change anywhere is reflected
    /// everywhere without plumbing.
    static let shared = StudioDefaults()

    private enum Key {
        static let theme = "gc.defaults.theme"
        static let chordStyle = "gc.defaults.chordStyle"
        static let keepAwake = "gc.defaults.keepAwake"
        static let autoHideChrome = "gc.viewer.autoHideChrome"
    }

    /// Appearance override, applied by the root view through `.preferredColorScheme`.
    @Published var theme: ThemePreference {
        didSet { store.set(theme.rawValue, forKey: Key.theme) }
    }

    /// The chord spelling a newly opened Viewer starts with. In-viewer changes are
    /// session-local and do NOT write back here — same rule as mobile, where the
    /// global default is owned by Settings.
    @Published var chordStyle: ChordStyle {
        didSet { store.set(chordStyle.rawValue, forKey: Key.chordStyle) }
    }

    /// Hold off display sleep while a chart is on screen. Defaults off.
    @Published var keepAwake: Bool {
        didSet { store.set(keepAwake, forKey: Key.keepAwake) }
    }

    /// Fade the header and transpose bar after an idle delay. Defaults off.
    @Published var autoHideChrome: Bool {
        didSet { store.set(autoHideChrome, forKey: Key.autoHideChrome) }
    }

    private let store: UserDefaults

    /// `store` is injectable so tests and previews can run against a scratch
    /// domain instead of the user's real preferences.
    init(store: UserDefaults = .standard) {
        self.store = store
        // A missing or unrecognised stored value falls back to the default rather
        // than failing — a preferences file is not a contract we control.
        self.theme = (store.string(forKey: Key.theme)
            .flatMap(ThemePreference.init(rawValue:))) ?? .system
        self.chordStyle = (store.string(forKey: Key.chordStyle)
            .flatMap(ChordStyle.init(rawValue:))) ?? .letters
        self.keepAwake = store.bool(forKey: Key.keepAwake)
        self.autoHideChrome = store.bool(forKey: Key.autoHideChrome)
    }
}
