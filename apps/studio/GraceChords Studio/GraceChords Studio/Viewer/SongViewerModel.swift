//
//  SongViewerModel.swift
//  GraceChords Studio
//
//  State for one open song: the fetched row, the rendered chart, and the live view
//  controls.
//
//  Port of the state half of apps/mobile/app/viewer/[slug].tsx. The split between
//  what persists and what does not is mobile's, deliberately:
//
//    - transpose, show-chords, show-sections, font size and accidental are
//      SESSION-EPHEMERAL (mobile: useState) — reopening a song starts clean.
//    - chord style seeds from the app-wide default on open and then stays
//      session-local; in-viewer changes never write back to that default.
//    - column mode persists per song (ViewerPrefs), keep-awake and hide-when-idle
//      persist app-wide (StudioDefaults).
//
//  Derived values (rendered doc, key label, capo chip) are recomputed on change
//  and stored rather than computed in a getter: each one costs a JavaScriptCore
//  call, and a getter read from `body` would run them on every layout pass.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import Foundation

@MainActor
final class SongViewerModel: ObservableObject {
    /// Font-size bounds, matching apps/mobile's ViewOptionsSheet exactly.
    static let fontScaleMin = 0.8
    static let fontScaleMax = 1.6
    static let fontScaleStep = 0.1

    // MARK: - Loaded song

    @Published private(set) var song: SongDetail?
    @Published private(set) var isLoading = true
    @Published private(set) var errorText: String?
    /// Set when the body could not be parsed or the JS bundle is unavailable; the
    /// view falls back to lyrics-only text, as mobile does.
    @Published private(set) var parseErrorText: String?
    /// The chart as it should be drawn right now — already transposed and spelled
    /// according to the current options.
    @Published private(set) var doc: SongDoc?

    // MARK: - Session-ephemeral view options

    /// Show-chords, show-sections and font size are pure display toggles — the
    /// chart view applies them, so none of them needs a re-render through the
    /// bridge.
    @Published var showChords = true
    @Published var showSections = true
    @Published var fontScale = 1.0
    /// Chord style changes both the symbols in the chart and the spelling of the
    /// key pill, so it refreshes both.
    @Published var chordStyle: ChordStyle {
        didSet {
            guard chordStyle != oldValue else { return }
            refreshDerived()
            refreshChart()
        }
    }
    @Published private(set) var accidental: Accidental = .sharp
    /// The user's net ± taps. Kept separate from `steps` because the capo hint is
    /// derived from the taps, not from the absolute transpose.
    @Published private(set) var delta = 0

    // MARK: - Derived display values

    @Published private(set) var keyLabel = ""
    /// "Capo 2 for D", or nil when no capo applies.
    @Published private(set) var capoText: String?

    /// The song's own key — the origin every transpose is measured from.
    private(set) var nativeKey = ""

    let slug: String
    private let services: AppServices
    /// Seed transpose for opening a song in a setlist's key. Studio has no
    /// setlists yet; the parameter keeps mobile's seam so adding them later needs
    /// no change to the transpose model.
    private let initialKey: String?
    private var seedSteps = 0
    /// Once the user picks an accidental themselves, the key stops reseeding it.
    private var accidentalTouched = false

    init(slug: String, services: AppServices, initialKey: String? = nil, defaults: StudioDefaults = .shared) {
        self.slug = slug
        self.services = services
        self.initialKey = initialKey
        self.chordStyle = defaults.chordStyle
    }

    // MARK: - Transpose model (port of viewer/[slug].tsx)

    /// Absolute transpose applied to the chart, normalised to 0–11.
    var steps: Int {
        let raw = (seedSteps + delta) % 12
        return (raw + 12) % 12
    }

    var preferFlat: Bool { accidental.preferFlat }

    /// The key the chart currently reads in, in letter spelling.
    ///
    /// Internal rather than private because Export sends it to the server, which
    /// wants a real key — never the solfège *label* the key pill shows.
    var effectiveKey: String {
        guard steps != 0, !nativeKey.isEmpty else { return nativeKey }
        return (try? services.bridge?.transpose(nativeKey, steps: steps, preferFlat: preferFlat))
            .flatMap { $0 } ?? nativeKey
    }

    func transpose(by direction: Int) {
        delta += direction
        refreshDerived()
        refreshChart()
    }

    /// Jump straight to a chosen key, or back to the song's own key when `key` is
    /// nil — derived as a relative delta so the ± taps and the picker share one
    /// model, exactly as mobile's `pickKey` does.
    func pick(key: String?) {
        guard let key = key else {
            delta = -seedSteps
            accidentalTouched = false
            accidental = Accidental.default(for: nativeKey)
            refreshDerived()
            refreshChart()
            return
        }
        let target = (try? services.bridge?.stepsBetween(from: nativeKey, to: key)).flatMap { $0 } ?? 0
        delta = target - seedSteps
        setAccidental(key.contains("b") ? .flat : .sharp)
    }

    /// Explicit user choice of accidental — latches, so the key no longer reseeds it.
    func setAccidental(_ value: Accidental) {
        accidentalTouched = true
        guard accidental != value else { return }
        accidental = value
        refreshDerived()
        refreshChart()
    }

    func stepFontScale(by direction: Int) {
        let next = ((fontScale + Double(direction) * Self.fontScaleStep) * 10).rounded() / 10
        fontScale = min(Self.fontScaleMax, max(Self.fontScaleMin, next))
    }

    var isAtMinimumFontScale: Bool { fontScale <= Self.fontScaleMin }
    var isAtMaximumFontScale: Bool { fontScale >= Self.fontScaleMax }
    var fontScalePercentLabel: String { "\(Int((fontScale * 100).rounded()))%" }

    /// Whether the transpose bar has anything to show — mobile hides it when there
    /// is no key to display.
    var showsTransposeBar: Bool { !keyLabel.isEmpty }

    // MARK: - Loading

    func load() async {
        isLoading = true
        errorText = nil
        parseErrorText = nil
        doc = nil

        do {
            let fetched = try await services.songs.fetchSong(slug: slug)
            song = fetched
            if let fetched = fetched {
                prepare(fetched)
            }
        } catch SongsRepositoryError.sessionExpired {
            onSessionExpired?()
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
        isLoading = false
    }

    /// Called when a query reports a rejected token so the shell can return to
    /// sign-in. Set by the view.
    var onSessionExpired: (() -> Void)?

    /// Establish the native key and the transpose seed, then draw the chart. The
    /// key has to be known before the first render, because it is what the seed
    /// and the accidental default are derived from.
    private func prepare(_ song: SongDetail) {
        guard let bridge = services.bridge else {
            parseErrorText = services.bridgeErrorText ?? "The ChordPro parser is unavailable."
            nativeKey = song.defaultKey ?? ""
            seedAccidentalAndSeedSteps(bridge: nil)
            return
        }
        let body = song.chordproContent ?? ""
        guard !body.isEmpty else {
            nativeKey = song.defaultKey ?? ""
            seedAccidentalAndSeedSteps(bridge: bridge)
            return
        }
        // A plain parse first, only to read meta.key. `render` preserves meta, but
        // the seed has to exist before the first render can be asked for.
        do {
            let plain = try bridge.parse(body)
            let metaKey = plain.meta.key ?? ""
            nativeKey = metaKey.isEmpty ? (song.defaultKey ?? "") : metaKey
        } catch {
            parseErrorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
            nativeKey = song.defaultKey ?? ""
        }
        seedAccidentalAndSeedSteps(bridge: bridge)
        refreshChart()
    }

    private func seedAccidentalAndSeedSteps(bridge: CoreBridge?) {
        if let initialKey = initialKey, !initialKey.isEmpty, !nativeKey.isEmpty, let bridge = bridge {
            seedSteps = (try? bridge.stepsBetween(from: nativeKey, to: initialKey)) ?? 0
        } else {
            seedSteps = 0
        }
        if !accidentalTouched {
            accidental = Accidental.default(for: nativeKey)
        }
        refreshDerived()
    }

    /// Re-render the chart for the current transpose and chord style.
    private func refreshChart() {
        guard let bridge = services.bridge, let body = song?.chordproContent, !body.isEmpty else { return }
        do {
            doc = try bridge.render(body, steps: steps, preferFlat: preferFlat, style: chordStyle)
            parseErrorText = nil
        } catch {
            doc = nil
            parseErrorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }

    /// Recompute the key pill and capo chip.
    private func refreshDerived() {
        let key = effectiveKey
        guard let bridge = services.bridge, !key.isEmpty else {
            keyLabel = key
            capoText = nil
            return
        }
        keyLabel = (try? bridge.formatKey(key, style: chordStyle)) ?? key
        // `delta`, not `steps`: only a net DOWNWARD move from the key the taps
        // started at has a capo equivalent.
        if let capo = try? bridge.capoChip(delta: delta, displayedKey: key, preferFlat: preferFlat, style: chordStyle) {
            capoText = "Capo \(capo.fret) for \(capo.key)"
        } else {
            capoText = nil
        }
    }

    // MARK: - Raw fallback

    /// Lyrics recovered from a body the parser could not handle: `{directive}` and
    /// `# comment` lines dropped, `[Chord]` tokens stripped. Port of the
    /// RawFallback helper in mobile's viewer, which shows something readable
    /// instead of an empty page.
    static func rawFallbackLines(from content: String) -> [String] {
        content
            .replacingOccurrences(of: "\r\n", with: "\n")
            .components(separatedBy: "\n")
            .filter { line in
                let directiveOnly = line.range(
                    of: "^\\s*\\{[^}]*\\}\\s*$", options: .regularExpression) != nil
                let comment = line.range(of: "^\\s*#", options: .regularExpression) != nil
                return !directiveOnly && !comment
            }
            .map {
                $0.replacingOccurrences(
                    of: "\\[[^\\]]*\\]", with: "", options: .regularExpression)
            }
    }
}
