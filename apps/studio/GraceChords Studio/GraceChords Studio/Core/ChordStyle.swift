//
//  ChordStyle.swift
//  GraceChords Studio
//
//  Display-model types the Viewer shares with apps/mobile: how chords are
//  spelled, and the capo hint derived from a transpose.
//
//  Ports of apps/mobile/src/components/AccidentalToggle.tsx (the two helpers, not
//  the control) and apps/mobile/src/lib/capo.ts. Nothing musical is reimplemented
//  — the key math these lean on lives in packages/core and is reached through
//  CoreBridge.
//

import Foundation

/// How chord symbols and keys are spelled. Matches core's `style` option, so the
/// raw values are what cross the JS bridge.
enum ChordStyle: String, CaseIterable, Codable, Sendable {
    case letters
    case solfege

    /// Title for the segmented control, matching mobile's song.json strings.
    var label: String {
        switch self {
        case .letters: return "Letters"
        case .solfege: return "Solfège"
        }
    }
}

/// Accidental spelling: a concrete ♯ or ♭. There is deliberately no "auto" case —
/// the default is resolved from the key up front, then the user can flip it.
enum Accidental: String, CaseIterable, Sendable {
    case sharp
    case flat

    /// ♭ when the key is already spelled with a flat (Bb, Eb…), else ♯.
    static func `default`(for key: String?) -> Accidental {
        guard let key = key, key.contains("b") else { return .sharp }
        return .flat
    }

    /// The boolean core's transpose helpers expect.
    var preferFlat: Bool { self == .flat }

    var glyph: String { self == .sharp ? "♯" : "♭" }

    var accessibilityLabel: String { self == .sharp ? "Sharps" : "Flats" }
}

/// Capo hint for the Viewer.
///
/// A capo raises the pitch of played shapes, so a capo position exists only when
/// the chart has been transposed *down* from the key the song should sound in:
/// shapes N semitones below the target, plus a capo at fret N, sound the target.
/// Zero or upward transposes — and whole octaves — have no capo equivalent.
enum Capo {
    /// Capo fret for a signed transpose, or nil when no capo applies.
    ///
    /// `delta` is the semitones the chart was moved relative to the sounding key,
    /// which is what the Viewer's ± taps accumulate.
    static func fret(delta: Int) -> Int? {
        guard delta < 0 else { return nil }
        let fret = -delta % 12
        return fret == 0 ? nil : fret
    }
}
