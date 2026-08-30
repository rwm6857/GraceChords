//
//  LintWarning.swift
//  GraceChords Studio
//
//  One advisory finding from packages/core/src/chordpro/lint.ts.
//
//  No CodingKeys: core emits `{code, message, sectionIndex, lineIndex}` in
//  camelCase already, unlike the snake_case PostgREST rows in Data/SongModels.swift.
//
//  There is deliberately no severity here, because core has none — every code it
//  emits is prefixed `warn:` and the module never reports a hard error. A body the
//  parser cannot handle is a different failure entirely (CoreBridge.parse throws),
//  and the editor shows that as its own state rather than folding it in as a
//  pseudo-warning that lint never actually produced.
//
//  **`lineIndex` means two different things and this file no longer pretends
//  otherwise.** Read `lint.ts`: for `warn:long_line` and `warn:unknown_chord` it is
//  an index into the *lyric lines of a section*, counted after comment lines are
//  filtered out; for `warn:section_mismatch` it is an index into the *raw body's
//  lines*, produced by a separate text scan that never touches the parsed document.
//  Two units, one JSON field. Treating them as one number is how a "jump to this
//  warning" lands on the wrong line, so `location` sorts them into cases the rest of
//  the app has to handle separately — see Editor/LintLocator.swift, which will only
//  resolve a caret position when it can do so without guessing.
//

import Foundation

struct LintWarning: Codable, Hashable, Identifiable {
    /// Core's code, e.g. `warn:missing_key`. Kept as a raw String rather than an
    /// enum so a code added to core later renders as an unfamiliar-but-visible
    /// warning instead of failing the whole array's decode.
    let code: String
    let message: String
    /// Index into the parsed document's sections, when the warning is about one.
    let sectionIndex: Int?
    /// Raw from core. Use `location` rather than reading this directly — on its own
    /// it does not say which of the two units it is in.
    let lineIndex: Int?

    /// Stable across a re-lint of unchanged text, which keeps SwiftUI from
    /// re-creating rows as the user types.
    var id: String { "\(code)|\(sectionIndex?.description ?? "-")|\(lineIndex?.description ?? "-")|\(message)" }

    // MARK: - Codes

    /// The one code whose `lineIndex` counts raw body lines.
    static let sectionMismatch = "warn:section_mismatch"
    /// The two codes the editor suppresses when the form's columns carry the value.
    static let missingTitle = "warn:missing_title"
    static let missingKey = "warn:missing_key"

    // MARK: - Location

    /// Where a warning points, in units the caller can act on.
    enum Location: Hashable {
        /// The song as a whole — a missing title or key.
        case song
        /// A section, but no line within it.
        case section(Int)
        /// A line *within a section*, counted over that section's lyric lines only.
        case sectionLine(section: Int, lyricLine: Int)
        /// A line of the raw body, directly usable as a caret position.
        case bodyLine(Int)
    }

    var location: Location {
        // `warn:section_mismatch` is the only code produced by lint.ts's raw-text
        // scan, and the only one whose lineIndex is a body line. Keyed on the code
        // rather than on "has a lineIndex but no sectionIndex", because a future code
        // with that shape would silently inherit the wrong unit.
        if code == Self.sectionMismatch, let lineIndex = lineIndex {
            return .bodyLine(lineIndex)
        }
        if let sectionIndex = sectionIndex {
            if let lineIndex = lineIndex {
                return .sectionLine(section: sectionIndex, lyricLine: lineIndex)
            }
            return .section(sectionIndex)
        }
        if let lineIndex = lineIndex { return .bodyLine(lineIndex) }
        return .song
    }

    /// The code with its `warn:` prefix dropped and underscores opened up, for the
    /// small label next to the message: `warn:missing_key` → "missing key".
    var shortLabel: String {
        let stripped = code.hasPrefix("warn:") ? String(code.dropFirst("warn:".count)) : code
        return stripped.replacingOccurrences(of: "_", with: " ")
    }

    /// A human-readable location, or nil when the warning is about the whole song.
    ///
    /// The wording distinguishes the two units rather than printing "line N" for
    /// both: "section 2, lyric line 3" cannot be mistaken for a line number you could
    /// count to in the editor, and "line 14" — which you can — is only ever said when
    /// that is literally true.
    var locationText: String? {
        switch location {
        case .song:
            return nil
        case .section(let index):
            return "section \(index + 1)"
        case .sectionLine(let section, let lyricLine):
            return "section \(section + 1), lyric line \(lyricLine + 1)"
        case .bodyLine(let line):
            return "line \(line + 1)"
        }
    }
}
