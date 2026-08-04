//
//  PDFImportModels.swift
//  GraceChords Studio
//
//  Swift mirrors of the two ends of packages/core/src/songs/pdfImport.ts:
//  `ExtractedDocument` going out and `SongDraft` coming back. Field names and
//  optionality follow the TS types exactly, since these cross the bridge as JSON.
//
//  Keep in sync with pdfImport.ts. If a field is added there, add it here.
//

import Foundation

// MARK: - Going out

struct PDFExtractedWord: Codable {
    let text: String
    /// Left edge, page points.
    let x: Double
    /// TOP edge, in a top-down space — see `PDFExtractedLine.y`.
    let y: Double
    let w: Double
    let h: Double
    /// UTF-16 offset of this word's first character within its line's `text`.
    let start: Int
    /// UTF-16 offset one past its last character.
    let end: Int
    /// Left edge of each character, measured and validated. nil means the aligner
    /// must snap to the word start rather than guess a mid-word position.
    let charX: [Double]?
}

struct PDFExtractedLine: Codable {
    let text: String
    let words: [PDFExtractedWord]
    let x: Double
    /// TOP edge, y increasing DOWNWARD from the top of the crop box. PDF user space
    /// is y-up; the extractor flips it so that "above" is unambiguously "smaller y"
    /// on both sides of the bridge.
    let y: Double
    let w: Double
    let h: Double
    let fontSize: Double?
    let isBold: Bool?
    let page: Int
    /// 0-based column, or nil for a line spanning the gutter (title, centered footer).
    let column: Int?
    /// First line of a page or of a column.
    let startsBlock: Bool
}

struct PDFExtractedPage: Codable {
    let index: Int
    let width: Double
    let height: Double
    /// 1 or 2 — detected per page, since a chart may change layout on page 2.
    let columnCount: Int
    /// False when the columns could not be made sense of. Core skips chord/lyric
    /// pairing for such a page rather than pairing across an unknown boundary.
    let layoutTrusted: Bool
}

struct PDFExtraction: Codable {
    /// Already in reading order: page ascending, then the title band, then column-major.
    let lines: [PDFExtractedLine]
    let pages: [PDFExtractedPage]
    /// Self-checks that fired. Each one costs the draft confidence.
    let diagnostics: [String]

    var isEmpty: Bool { lines.isEmpty }
}

// MARK: - Coming back

struct ImportWarning: Codable, Hashable, Identifiable {
    let code: String
    let message: String

    var id: String { code + message }
}

struct SongDraftStats: Codable, Hashable {
    let sections: Int
    let chords: Int
    let lyricLines: Int
    let suspiciousInsertions: Int
    let unpairedChordLines: Int
}

struct SongDraft: Codable {
    let title: String?
    let key: String?
    let artist: String?
    /// Digits only, matching `SongForm.tempo`.
    let tempo: String?
    let timeSignature: String?
    /// The body, ready for `SongForm.chordproContent`. Never carries {title}/{key} —
    /// those are Supabase columns, and the editor's form owns them.
    let chordpro: String
    /// 0–100.
    let confidence: Int
    let warnings: [ImportWarning]
    let stats: SongDraftStats

    /// Below this, the editor offers the diagnostics rather than just the summary.
    static let lowConfidence = 70

    /// One line for the editor's status banner: what came in, then what to check.
    var summary: String {
        let name = title.map { "“\($0)”" } ?? "the chart"
        var parts = ["Imported \(name) — \(stats.sections) \(stats.sections == 1 ? "section" : "sections"), \(stats.chords) \(stats.chords == 1 ? "chord" : "chords")."]
        parts.append(contentsOf: warnings.map(\.message))
        return parts.joined(separator: " ")
    }
}
