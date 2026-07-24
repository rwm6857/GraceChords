//
//  ChordChartView.swift
//  GraceChords Studio
//
//  Renders a parsed SongDoc. Deliberately mirrors apps/mobile's ChordChart:
//  chords are anchored to the word they land on (not padded into a monospaced
//  grid), sections get an uppercase label, comment lines are italic, and
//  instrumental lines are chord tokens joined with "  //  ".
//
//  The chord placement algorithm is a port of buildWordCells in
//  apps/mobile/src/components/ChordChart.tsx — same rules, so the same song looks
//  the same in both apps.
//

import SwiftUI

struct ChordChartView: View {
    let doc: SongDoc

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(Array(doc.sections.enumerated()), id: \.offset) { _, section in
                SectionView(section: section)
            }
        }
    }
}

private struct SectionView: View {
    let section: SongSection

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label = section.label, !label.isEmpty {
                Text(label.uppercased())
                    .font(.caption.weight(.semibold))
                    .kerning(0.6)
                    .foregroundStyle(.tint)
            }
            ForEach(Array(section.lines.enumerated()), id: \.offset) { _, line in
                LineView(line: line)
            }
        }
    }
}

private struct LineView: View {
    let line: SongLine

    private static let lyricFont = Font.system(size: 15)
    private static let chordFont = Font.system(size: 13, weight: .bold, design: .monospaced)

    var body: some View {
        if let instrumental = line.instrumental {
            let text = ChordChartFormat.instrumentalLine(instrumental)
            if text.isEmpty {
                EmptyView()
            } else {
                Text(text)
                    .font(Self.chordFont)
                    .foregroundStyle(.tint)
            }
        } else if let comment = line.comment, !comment.isEmpty {
            Text(comment)
                .font(.system(size: 14).italic())
                .foregroundStyle(.secondary)
        } else if line.lyrics.isEmpty && line.chords.isEmpty {
            // A genuinely blank line keeps its vertical space, as on mobile.
            Text(" ").font(Self.lyricFont)
        } else if line.chords.isEmpty {
            Text(line.lyrics).font(Self.lyricFont)
        } else {
            FlowLayout(horizontalSpacing: 5, verticalSpacing: 2) {
                ForEach(Array(ChordChartFormat.wordCells(for: line).enumerated()), id: \.offset) { _, cell in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(cell.chords.isEmpty ? " " : cell.chords.joined(separator: " "))
                            .font(Self.chordFont)
                            .foregroundStyle(.tint)
                        Text(cell.text.isEmpty ? " " : cell.text)
                            .font(Self.lyricFont)
                    }
                }
            }
        }
    }
}

enum ChordChartFormat {
    /// A word (or a trailing anchor) plus the chords sitting on it.
    struct WordCell {
        var text: String
        var chords: [String]
    }

    /// Port of buildWordCells in apps/mobile/src/components/ChordChart.tsx.
    ///
    /// Chord indices from the parser are UTF-16 offsets into `lyrics` (JS string
    /// indices), so the scan works in UTF-16 units rather than Characters —
    /// otherwise songs with non-ASCII lyrics would misplace their chords.
    static func wordCells(for line: SongLine) -> [WordCell] {
        let units = Array(line.lyrics.utf16)
        var words: [(text: String, start: Int, end: Int)] = []

        var index = 0
        while index < units.count {
            if isWhitespace(units[index]) {
                index += 1
                continue
            }
            let start = index
            while index < units.count && !isWhitespace(units[index]) { index += 1 }
            words.append((String(decoding: units[start..<index], as: UTF16.self), start, index))
        }

        var cells = words.map { WordCell(text: $0.text, chords: []) }
        var trailing: [String] = []

        for chord in line.chords {
            // The word this chord starts on, else the first word starting after it.
            var target = words.firstIndex { chord.index >= $0.start && chord.index < $0.end }
            if target == nil {
                target = words.firstIndex { $0.start >= chord.index }
            }
            if let target = target {
                cells[target].chords.append(chord.sym)
            } else {
                trailing.append(chord.sym)
            }
        }
        if !trailing.isEmpty {
            cells.append(WordCell(text: "", chords: trailing))
        }
        return cells
    }

    /// Port of formatInstrumental (split: false) in
    /// packages/core/src/songs/instrumental.js: chords joined with "  //  ", the
    /// repeat count appended to the last chord, and a bare "xN" when there are no
    /// chords at all.
    static func instrumentalLine(_ directive: InstrumentalDirective) -> String {
        let chords = directive.chords
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let repeatCount = (directive.repeatCount ?? 0) > 1 ? directive.repeatCount : nil

        guard !chords.isEmpty else {
            if let repeatCount = repeatCount { return "x\(repeatCount)" }
            return ""
        }

        var tokens = chords
        if let repeatCount = repeatCount, let last = tokens.last {
            tokens[tokens.count - 1] = "\(last) x\(repeatCount)"
        }
        return tokens.joined(separator: "  //  ")
    }

    private static func isWhitespace(_ unit: UInt16) -> Bool {
        // Surrogate halves are never whitespace; anything else is checked as a
        // scalar, which covers the spaces and line breaks JS's \s matches.
        guard let scalar = Unicode.Scalar(unit) else { return false }
        return CharacterSet.whitespacesAndNewlines.contains(scalar)
    }
}
