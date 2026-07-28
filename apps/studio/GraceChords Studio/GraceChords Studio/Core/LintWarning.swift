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

import Foundation

struct LintWarning: Codable, Hashable, Identifiable {
    /// Core's code, e.g. `warn:missing_key`. Kept as a raw String rather than an
    /// enum so a code added to core later renders as an unfamiliar-but-visible
    /// warning instead of failing the whole array's decode.
    let code: String
    let message: String
    /// Index into the parsed document's sections, when the warning is about one.
    let sectionIndex: Int?
    /// For most codes this indexes the *lyric lines within a section*, but for
    /// `warn:section_mismatch` it is an index into the raw body's lines — core
    /// derives that one from a separate text scan. That inconsistency is why
    /// nothing here tries to turn it into a caret position in the editor.
    let lineIndex: Int?

    /// Stable across a re-lint of unchanged text, which keeps SwiftUI from
    /// re-creating rows as the user types.
    var id: String { "\(code)|\(sectionIndex?.description ?? "-")|\(lineIndex?.description ?? "-")|\(message)" }

    /// The code with its `warn:` prefix dropped and underscores opened up, for the
    /// small label next to the message: `warn:missing_key` → "missing key".
    var shortLabel: String {
        let stripped = code.hasPrefix("warn:") ? String(code.dropFirst("warn:".count)) : code
        return stripped.replacingOccurrences(of: "_", with: " ")
    }

    /// A human-readable location, or nil when the warning is about the whole song
    /// (a missing title or key).
    var locationText: String? {
        if let lineIndex = lineIndex, let sectionIndex = sectionIndex {
            return "section \(sectionIndex + 1), line \(lineIndex + 1)"
        }
        if let lineIndex = lineIndex { return "line \(lineIndex + 1)" }
        if let sectionIndex = sectionIndex { return "section \(sectionIndex + 1)" }
        return nil
    }
}
