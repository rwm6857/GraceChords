//
//  ChordProEditing.swift
//  GraceChords Studio
//
//  Models for the editor's quick-insert helpers.
//
//  The string math itself is NOT here — it is `packages/core/src/chordpro/editing.ts`,
//  reached through CoreBridge, so Studio inserts chords and wraps sections
//  byte-identically to the web editor.
//
//  There used to be a selection-conversion layer here too, turning SwiftUI's
//  `TextSelection` (which indexes by Character) into the UTF-16 offsets a JS string
//  index means. `ChordProTextView` made it unnecessary: `NSRange` is UTF-16, so the
//  caret and core's offsets are the same numbers and nothing has to translate them.
//

import Foundation

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

// MARK: - Selection

extension ChordProEdit.Selection {
    /// Core's returned caret as a range into the *new* body.
    var range: NSRange {
        NSRange(location: start, length: Swift.max(0, end - start))
    }
}
