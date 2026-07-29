//
//  ChordProEditing.swift
//  GraceChords Studio
//
//  Models for the editor's quick-insert helpers, plus the offset conversion the
//  bridge boundary needs.
//
//  The string math itself is NOT here — it is `packages/core/src/chordpro/editing.ts`,
//  reached through CoreBridge, so Studio inserts chords and wraps sections
//  byte-identically to the web editor. What lives here is the part that is genuinely
//  platform-specific: turning SwiftUI's `TextSelection` into the UTF-16 offsets a JS
//  string index means, and back.
//

import Foundation
// SwiftUI for `TextSelection`. Imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import SwiftUI

/// One section button. Mirrors core's `SectionPreset`.
///
/// `directive` and `sectionLabel` differ on purpose for two of them: the parser only
/// accepts verse|chorus|bridge|intro|tag|outro, so core emits Pre-Chorus and Interlude
/// as *named choruses* rather than directives the parser would silently drop. That
/// rule lives in core and arrives here already applied — do not "fix" it locally.
struct SectionPreset: Codable, Hashable, Identifiable {
    let label: String
    let directive: String
    let sectionLabel: String

    var id: String { label }
}

/// One diatonic chord for the current key. Mirrors core's `getDiatonicChords` output.
struct DiatonicChord: Codable, Hashable, Identifiable {
    /// Roman numeral, e.g. `I`, `vi`, `vii°`.
    let degree: String
    /// What gets inserted, e.g. `F#m`.
    let symbol: String
    /// What gets shown; differs from `symbol` only where core spells an awkward
    /// enharmonic more kindly (F# major's `E#dim` displays as `Fdim`).
    let display: String

    var id: String { degree + symbol }
}

/// The result of an edit: new text plus where the caret or selection ends up.
struct ChordProEdit: Codable {
    struct Selection: Codable {
        /// UTF-16 offsets, matching JS string indices.
        let start: Int
        let end: Int
    }

    let value: String
    let selection: Selection
}

// MARK: - Selection conversion

extension String {
    /// UTF-16 offset of a `String.Index`.
    ///
    /// UTF-16 rather than `distance(from:to:)`, which counts Characters: a JS string
    /// index is a UTF-16 code-unit offset, and the two disagree the moment a lyric
    /// contains anything outside ASCII. The catalog has Turkish and Korean songs, so
    /// this is a real difference, not a theoretical one.
    func utf16Offset(of index: String.Index) -> Int {
        utf16.distance(from: startIndex, to: index)
    }

    /// A `String.Index` from a UTF-16 offset, clamped into range.
    ///
    /// Clamped because the offsets come back from JavaScript, and an index past the
    /// end (or one landing inside a surrogate pair) would trap rather than misbehave.
    /// `samePosition(in:)` returns nil for an offset in the middle of a grapheme; the
    /// fallback walks to the nearest whole Character so a caret can always be placed.
    func index(fromUTF16Offset offset: Int) -> String.Index {
        let clamped = Swift.max(0, Swift.min(offset, utf16.count))
        let utf16Index = utf16.index(utf16.startIndex, offsetBy: clamped)
        if let exact = utf16Index.samePosition(in: self) { return exact }
        // Mid-grapheme: round down to the Character boundary containing it.
        var candidate = utf16Index
        while candidate > utf16.startIndex {
            candidate = utf16.index(before: candidate)
            if let exact = candidate.samePosition(in: self) { return exact }
        }
        return startIndex
    }
}

@available(macOS 15.0, *)
extension TextSelection {
    /// The selected range as UTF-16 offsets into `text`.
    ///
    /// A caret with nothing selected is `.selection` with an empty range, so it needs
    /// no separate case. `.multiSelection` takes the first range: core's edit helpers
    /// describe one contiguous replacement, and quietly applying an insertion to only
    /// part of a multi-selection is less confusing than applying it to all of them.
    func utf16Range(in text: String) -> (start: Int, end: Int) {
        switch indices {
        case .selection(let range):
            return (text.utf16Offset(of: range.lowerBound), text.utf16Offset(of: range.upperBound))
        case .multiSelection(let set):
            guard let first = set.ranges.first else { return (0, 0) }
            return (text.utf16Offset(of: first.lowerBound), text.utf16Offset(of: first.upperBound))
        @unknown default:
            return (0, 0)
        }
    }

    /// A selection spanning the given UTF-16 offsets in `text`.
    static func spanning(_ selection: ChordProEdit.Selection, in text: String) -> TextSelection {
        let lower = text.index(fromUTF16Offset: selection.start)
        let upper = text.index(fromUTF16Offset: selection.end)
        // Guard against an inverted range after clamping.
        return TextSelection(range: lower <= upper ? lower..<upper : lower..<lower)
    }
}
