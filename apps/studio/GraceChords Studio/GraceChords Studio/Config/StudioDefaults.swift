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

@MainActor
final class StudioDefaults: ObservableObject {
    /// One store per process. The Viewer, the library and any future Settings
    /// surface all observe this instance, so a change anywhere is reflected
    /// everywhere without plumbing.
    static let shared = StudioDefaults()

    private enum Key {
        static let chordStyle = "gc.defaults.chordStyle"
        static let keepAwake = "gc.defaults.keepAwake"
        static let autoHideChrome = "gc.viewer.autoHideChrome"
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
        self.chordStyle = (store.string(forKey: Key.chordStyle)
            .flatMap(ChordStyle.init(rawValue:))) ?? .letters
        self.keepAwake = store.bool(forKey: Key.keepAwake)
        self.autoHideChrome = store.bool(forKey: Key.autoHideChrome)
    }
}
