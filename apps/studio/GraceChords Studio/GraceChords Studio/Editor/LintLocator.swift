//
//  LintLocator.swift
//  GraceChords Studio
//
//  Turns a lint warning into a caret position in the body — when it can be done
//  without guessing, and nil when it cannot.
//
//  Clicking a warning to jump to it was blocked on two things. One was that the
//  editor could not move the caret at all, which `ChordProTextView` fixed. The other
//  is that `lineIndex` is two different units depending on the code, which
//  `LintWarning.Location` now sorts out. What is left is this: a body line for each
//  case, or an honest refusal.
//
//  **What this deliberately does not do is pin a lyric line inside a section.**
//  `lint.ts` counts those over the *parsed* document — `sec.lines` with comment lines
//  filtered out — and reconstructing that index from raw text means reimplementing
//  the parser's line model in Swift, which is exactly the drift the bridge exists to
//  prevent. A jump that lands two lines off is worse than no jump: the writer edits
//  what they landed on. So a section-scoped warning takes you to the section's
//  opening line, and the row's own label ("section 2, lyric line 3") says where to
//  look from there.
//
//  If pinning that line ever matters enough, the fix is core emitting a body-relative
//  line alongside the section-relative one, not a cleverer scan here.
//

import Foundation

enum LintLocator {
    /// `parser.ts` RX_LONG_DIR's opening half, RX_SHORT_DIR's opening half, and
    /// RX_PLAIN_HEADER — the three ways a section starts in a body. Transcribed, and
    /// cross-checked below rather than trusted.
    private static let sectionOpener = try! NSRegularExpression(
        pattern: [
            "^\\{\\s*start_of_(?:verse|chorus|bridge|intro|tag|outro)(?::[^}]*)?\\s*\\}$",
            "^\\{\\s*(?:sov|soc|sob)(?::?[^}]*)?\\s*\\}$",
            "^(?:verse|chorus|bridge|intro|tag|outro)(?:\\s+\\d+)?$",
        ].joined(separator: "|"),
        options: [.caseInsensitive]
    )

    /// The body line a warning points at, or nil when it cannot be resolved.
    ///
    /// `sectionCount` is the parsed document's section count, and it is a *check*, not
    /// an input: if this file's idea of where sections start disagrees with the
    /// parser's about how many there are, the correspondence by ordinal is not sound
    /// and no jump is offered. That covers the cases this scan does not model — a
    /// body whose lyrics begin before any header, a directive the parser treats as an
    /// opener and this does not — by noticing them rather than by handling them.
    static func bodyLine(for warning: LintWarning, in body: String, sectionCount: Int) -> Int? {
        switch warning.location {
        case .song:
            return nil
        case .bodyLine(let line):
            return (0..<lineRanges(in: body).count).contains(line) ? line : nil
        case .section(let index):
            return sectionOpener(index, in: body, sectionCount: sectionCount)
        case .sectionLine(let index, _):
            return sectionOpener(index, in: body, sectionCount: sectionCount)
        }
    }

    private static func sectionOpener(_ index: Int, in body: String, sectionCount: Int) -> Int? {
        let openers = sectionOpenerLines(in: body)
        guard openers.count == sectionCount, openers.indices.contains(index) else { return nil }
        return openers[index]
    }

    /// The caret range for a warning: the whole of the line it points at.
    ///
    /// The whole line rather than its start, so the jump also *shows* which line was
    /// meant — a bare caret in a long song is easy to lose.
    static func range(for warning: LintWarning, in body: String, sectionCount: Int) -> NSRange? {
        guard let line = bodyLine(for: warning, in: body, sectionCount: sectionCount) else { return nil }
        let ranges = lineRanges(in: body)
        return ranges.indices.contains(line) ? ranges[line] : nil
    }

    // MARK: - Lines

    /// Zero-based indices of the lines that open a section.
    static func sectionOpenerLines(in body: String) -> [Int] {
        let text = body as NSString
        var result: [Int] = []
        for (index, range) in lineRanges(in: body).enumerated() {
            let trimmed = text.substring(with: range).trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty else { continue }
            let whole = NSRange(location: 0, length: (trimmed as NSString).length)
            if sectionOpener.firstMatch(in: trimmed, range: whole) != nil {
                result.append(index)
            }
        }
        return result
    }

    /// Every line's range, terminators excluded.
    ///
    /// Split on `\r?\n` rather than with `NSString.lineRange(for:)`, to match core's
    /// `split(/\r?\n/)` exactly. The two disagree on a lone `\r`, which AppKit counts
    /// as a line break and core does not — and a line index that means something
    /// different here than it did where it was produced is the whole bug this file
    /// exists to avoid.
    static func lineRanges(in body: String) -> [NSRange] {
        let text = body as NSString
        var ranges: [NSRange] = []
        var start = 0
        var index = 0
        while index < text.length {
            if text.character(at: index) == 0x0A {
                var end = index
                if end > start, text.character(at: end - 1) == 0x0D { end -= 1 }
                ranges.append(NSRange(location: start, length: end - start))
                start = index + 1
            }
            index += 1
        }
        // The text after the last terminator is a line too — empty, when the body ends
        // in a newline, which is what `split` produces there as well.
        ranges.append(NSRange(location: start, length: text.length - start))
        return ranges
    }
}
