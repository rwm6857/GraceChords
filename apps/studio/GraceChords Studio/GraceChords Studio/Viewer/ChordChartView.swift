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

/// The live view controls the chart honors.
///
/// Transposition and chord spelling are deliberately absent: those are applied
/// upstream by `CoreBridge.render`, so this view never does music math. What is
/// left is presentation — mobile's RenderOpts minus the parts core owns.
struct ChartRenderOptions: Equatable {
    var showChords = true
    var showSections = true
    var fontScale: Double = 1
    /// Wrap long instrumental rows onto two lines. Mobile sets this only in the
    /// two-column layout, where a row has half the width.
    var splitInstrumentals = false

    static let `default` = ChartRenderOptions()
}

/// Chart body metrics, from apps/mobile's ChordChart.
///
/// These are NOT run through `GCTypeScale.macOS` like the chrome ramp is: the
/// chart is content rather than interface, and a chord chart is read at arm's
/// length while playing, so it keeps mobile's sizes and the same song reads the
/// same in both apps. The font-size control scales all of them together.
enum GCChartMetrics {
    static let lyricSize: CGFloat = 17
    static let lineHeight: CGFloat = 24
    static let chordSize: CGFloat = 14
    static let commentSize: CGFloat = 14.5
}

struct ChordChartView: View {
    let doc: SongDoc
    var options: ChartRenderOptions = .default

    /// The parser re-opens a section after an inline `{instrumental}` directive,
    /// which can leave an empty trailing copy — line-less sections are skipped so
    /// no stray duplicate heading renders. Mobile filters the same way.
    private var sections: [SongSection] {
        doc.sections.filter { !$0.lines.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                ChartSectionView(section: section, options: options)
            }
        }
    }
}

/// One section. Internal rather than private because the two-column layout renders
/// sections one at a time, including offscreen for measurement.
struct ChartSectionView: View {
    let section: SongSection
    var options: ChartRenderOptions = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let label = section.label, !label.isEmpty, options.showSections {
                // `overline` is the ramp's uppercase group label — the rung that
                // matches this the way `sectionHeader` matches "Key of X".
                Text(label.uppercased())
                    .gcTextStyle(.overline)
                    .foregroundStyle(GCColor.textAccent)
                    .padding(.bottom, GCSpacing.xs)
            }
            ForEach(Array(section.lines.enumerated()), id: \.offset) { _, line in
                ChartLineView(line: line, options: options)
            }
        }
    }
}

private struct ChartLineView: View {
    let line: SongLine
    let options: ChartRenderOptions

    private var scale: CGFloat { CGFloat(options.fontScale) }
    private var lyricFont: Font { .system(size: GCChartMetrics.lyricSize * scale, weight: .medium) }
    private var chordFont: Font {
        .system(size: GCChartMetrics.chordSize * scale, weight: .bold, design: .monospaced)
    }
    private var lineHeight: CGFloat { (GCChartMetrics.lineHeight * scale).rounded() }

    /// Whether this line draws a chord row. Mirrors mobile's `hasChords`.
    private var hasChords: Bool { options.showChords && !line.chords.isEmpty }

    var body: some View {
        if let instrumental = line.instrumental {
            // A chord-only line has nothing to say in lyrics-only mode.
            if options.showChords {
                let rows = ChordChartFormat.instrumentalRows(
                    instrumental, split: options.splitInstrumentals)
                if rows.isEmpty {
                    EmptyView()
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                            Text(row)
                                .font(chordFont)
                                .foregroundStyle(GCColor.textAccent)
                        }
                    }
                    .padding(.bottom, 2)
                }
            }
        } else if let comment = line.comment, !comment.isEmpty {
            Text(comment)
                .font(.system(size: GCChartMetrics.commentSize * scale).italic())
                .foregroundStyle(GCColor.sec)
        } else if line.lyrics.isEmpty && !hasChords {
            // A chords-only line vanishes when chords are hidden; a genuinely
            // blank line keeps its vertical space.
            if line.chords.isEmpty {
                Color.clear.frame(height: lineHeight)
            }
        } else if !hasChords {
            Text(line.lyrics.isEmpty ? " " : line.lyrics)
                .font(lyricFont)
                .foregroundStyle(GCColor.ink)
        } else {
            FlowLayout(horizontalSpacing: GCChartMetrics.lyricSize * scale * 0.28, verticalSpacing: 2) {
                ForEach(Array(ChordChartFormat.wordCells(for: line).enumerated()), id: \.offset) { _, cell in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(cell.chords.isEmpty ? " " : cell.chords.joined(separator: " "))
                            .font(chordFont)
                            .foregroundStyle(GCColor.textAccent)
                        Text(cell.text.isEmpty ? " " : cell.text)
                            .font(lyricFont)
                            .foregroundStyle(GCColor.ink)
                    }
                }
            }
            .padding(.bottom, 2)
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

    /// Port of `formatInstrumental` in packages/core/src/songs/instrumental.js:
    /// chords joined with "  //  ", the repeat count appended to the last chord of
    /// the last row, and a bare "xN" when there are no chords at all.
    ///
    /// Returns rows, not a single string, because `split` can wrap a long run onto
    /// two lines — which the two-column layout needs and the single column does
    /// not. The symbols are already transposed and spelled by `CoreBridge.render`.
    static func instrumentalRows(_ directive: InstrumentalDirective, split: Bool = false) -> [String] {
        let chords = directive.chords
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let repeatCount = (directive.repeatCount ?? 0) > 1 ? directive.repeatCount : nil

        guard !chords.isEmpty else {
            if let repeatCount = repeatCount { return ["x\(repeatCount)"] }
            return []
        }

        let rows = splitRows(chords, split: split)
        return rows.enumerated().map { index, row in
            var tokens = row
            if index == rows.count - 1, let repeatCount = repeatCount, let last = tokens.last {
                tokens[tokens.count - 1] = "\(last) x\(repeatCount)"
            }
            return tokens.joined(separator: "  //  ")
        }
    }

    /// Port of `splitRows`: only splits when asked and there are more than three
    /// chords, with the extra chord going in the first row.
    private static func splitRows(_ chords: [String], split: Bool) -> [[String]] {
        guard split, chords.count > 3 else { return [chords] }
        let half = Int((Double(chords.count) / 2).rounded(.up))
        let first = Array(chords[0..<half])
        let second = Array(chords[half...])
        return second.isEmpty ? [first] : [first, second]
    }

    private static func isWhitespace(_ unit: UInt16) -> Bool {
        // Surrogate halves are never whitespace; anything else is checked as a
        // scalar, which covers the spaces and line breaks JS's \s matches.
        guard let scalar = Unicode.Scalar(unit) else { return false }
        return CharacterSet.whitespacesAndNewlines.contains(scalar)
    }
}
