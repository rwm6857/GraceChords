//
//  ChordProHighlighter.swift
//  GraceChords Studio
//
//  Colours a ChordPro body inside an `NSTextStorage`.
//
//  This is the one place in Studio that reads ChordPro without going through the
//  bridge, and that is a deliberate exception rather than an oversight. Everything
//  the bridge exists for — what a chord means, where a section starts, whether a
//  symbol is valid — is a *judgement*, and those stay in `packages/core`. Deciding
//  which characters to paint blue is not a judgement; it is the same lexical shape
//  the parser's own regexes describe, and running it over the bridge would mean a
//  JavaScriptCore round trip on every keystroke to produce something that has no
//  bearing on what gets saved. Highlighting is allowed to be wrong in a way the
//  parser is not: the cost is a mis-coloured bracket, not a mis-parsed song.
//
//  What it must not do is *disagree* with the parser about the obvious cases, so
//  every pattern below is transcribed from `packages/core/src/chordpro/parser.ts`
//  and names the constant it mirrors. If one of those changes, change these too —
//  a chord the parser reads that the editor leaves grey is a bug report waiting to
//  happen ("it didn't highlight, so I retyped it").
//
//  **Line-oriented, because ChordPro is.** No construct in the grammar spans a
//  newline: a directive is one line (`lexer.ts` trims and tests the ends), a
//  comment is one line, and `RX_CHORD` cannot match across one because `[^\]]`
//  would have to swallow the break. That is what makes an incremental re-highlight
//  exact rather than approximate — re-colouring the lines an edit touched is not a
//  heuristic that is usually right, it is the whole of the work. It is also why the
//  README's "re-highlight cost on a long song" worry does not survive contact:
//  typing re-scans one line, not the song.
//

import AppKit

struct ChordProHighlighter {
    /// The colours one appearance's worth of highlighting uses.
    ///
    /// Three roles, not seven: **blue is a chord, purple is structure, grey is
    /// something the parser ignores**, and anything left in `body` is a word a
    /// worshipper will sing. A ChordPro body is mostly lyrics, so the palette earns
    /// its keep by making the sparse things findable rather than by colouring
    /// everything — a rainbow here would compete with the lyrics for attention and
    /// the lyrics are what the writer is reading.
    struct Palette {
        /// Lyrics: the default, and most of the file.
        var body: NSColor
        /// The symbol inside `[ ]`.
        var chord: NSColor
        /// The brackets and braces themselves, held back so the symbol inside pops.
        var punctuation: NSColor
        /// Directives and bare section headers — the song's skeleton.
        var structure: NSColor
        /// A directive's value (a title, a label): content, so it reads as content.
        var value: NSColor
        /// `#` lines, which the parser skips entirely.
        var comment: NSColor
    }

    let palette: Palette
    let font: NSFont
    let boldFont: NSFont
    let chordFont: NSFont
    let paragraphStyle: NSParagraphStyle

    init(palette: Palette, size: CGFloat, lineSpacing: CGFloat) {
        self.palette = palette
        self.font = .monospacedSystemFont(ofSize: size, weight: .regular)
        self.boldFont = .monospacedSystemFont(ofSize: size, weight: .bold)
        // Semibold rather than bold for chords: they are frequent, and a whole line
        // of bold `[G] [C] [D]` above every lyric turns the body into a wall.
        self.chordFont = .monospacedSystemFont(ofSize: size, weight: .semibold)
        let style = NSMutableParagraphStyle()
        style.lineSpacing = lineSpacing
        self.paragraphStyle = style
    }

    /// Attributes for text with no syntax in it — also the text view's typing
    /// attributes, so a character typed at the end of a lyric starts neutral rather
    /// than inheriting the colour of whatever preceded it.
    var defaultAttributes: [NSAttributedString.Key: Any] {
        [.font: font, .foregroundColor: palette.body, .paragraphStyle: paragraphStyle]
    }

    // MARK: - Patterns
    //
    // Transcribed from packages/core/src/chordpro/parser.ts. The JS versions are
    // written against a line that has already been trimmed, so these are matched
    // against the trimmed span of the line and the result offset back — see
    // `highlight(_:in:)`.

    /// `parser.ts` RX_CHORD — `/\[([^\]]+)\]/g`. Unanchored: chords sit inline,
    /// anywhere in a lyric. Note it requires at least one character inside, so `[]`
    /// is not a chord to the parser and is not coloured as one here.
    private static let chord = try! NSRegularExpression(pattern: "\\[([^\\]]+)\\]")

    /// `parser.ts` RX_PLAIN_HEADER — a bare `Verse 2` line, which the parser
    /// promotes to a section heading without any braces.
    private static let plainHeader = try! NSRegularExpression(
        pattern: "^(verse|chorus|bridge|intro|tag|outro)(?:\\s+(\\d+))?$",
        options: [.caseInsensitive]
    )

    /// `parser.ts` RX_META — `{name: value}`. Used only to find where the value
    /// starts, so the two halves can be coloured differently.
    private static let meta = try! NSRegularExpression(
        pattern: "^\\{\\s*([^:}]+)\\s*:\\s*([^}]*)\\s*\\}$"
    )

    /// `parser.ts` RX_LONG_DIR and RX_SHORT_DIR, together. These are the directives
    /// that open or close a section, and the only ones drawn bold — they are what a
    /// writer scans for when jumping around a long song.
    private static let sectionDirective = try! NSRegularExpression(
        pattern: "^\\{\\s*(?:(?:start_of|end_of)_(?:verse|chorus|bridge|intro|tag|outro)|sov|eov|soc|eoc|sob|eob)\\b",
        options: [.caseInsensitive]
    )

    // MARK: - Highlighting

    /// Re-colour every line that `range` touches.
    ///
    /// Attributes only — this never changes a character. That is what keeps it out
    /// of the undo stack (AppKit coalesces attribute-only edits without registering
    /// an undo group) and what makes it safe to run from inside the text storage's
    /// own editing transaction.
    func highlight(_ storage: NSTextStorage, in range: NSRange) {
        let text = storage.string as NSString
        guard text.length > 0 else { return }

        // Expand to whole lines. An edit that deletes a newline joins two lines into
        // one that has to be re-read as a unit, and `lineRange(for:)` computed on the
        // post-edit string is exactly that unit.
        let clamped = NSRange(
            location: min(range.location, text.length),
            length: min(range.length, text.length - min(range.location, text.length))
        )
        let scope = text.lineRange(for: clamped)

        // One reset for the whole span, then paint over it. Cheaper than resetting
        // per line, and it guarantees no stale colour survives: every attribute this
        // type sets is set here first.
        storage.setAttributes(defaultAttributes, range: scope)

        var cursor = scope.location
        while cursor < NSMaxRange(scope) {
            let lineWithTerminator = text.lineRange(for: NSRange(location: cursor, length: 0))
            highlightLine(storage, text: text, lineRange: lineWithTerminator)
            cursor = NSMaxRange(lineWithTerminator)
            // A zero-length line range would spin forever; it cannot happen for a
            // location inside the string, but the loop should not depend on that.
            if lineWithTerminator.length == 0 { break }
        }
    }

    private func highlightLine(_ storage: NSTextStorage, text: NSString, lineRange: NSRange) {
        let content = Self.trimmed(in: text, range: lineRange)
        guard content.length > 0 else { return }
        let line = text.substring(with: content) as NSString
        let whole = NSRange(location: 0, length: line.length)

        // A `#` line is skipped wholesale by the parser (parser.ts checks the trimmed
        // line), so nothing inside it is live — including any `[G]` it happens to
        // contain. Colouring a chord inside a commented-out line would say the
        // opposite of what the parser does with it.
        if line.hasPrefix("#") {
            storage.addAttribute(.foregroundColor, value: palette.comment, range: content)
            return
        }

        // `lexer.ts`: a line is a directive when the trimmed line opens and closes
        // with braces. Anything else is lyrics, however brace-like it looks.
        if line.hasPrefix("{") && line.hasSuffix("}") {
            storage.addAttribute(.foregroundColor, value: palette.structure, range: content)
            if Self.sectionDirective.firstMatch(in: line as String, range: whole) != nil {
                storage.addAttribute(.font, value: boldFont, range: content)
            }
            // The value half is content — a title, a section label — so it reads as
            // text rather than as syntax. Only the value: the name and the braces
            // stay structural.
            if let match = Self.meta.firstMatch(in: line as String, range: whole),
               match.numberOfRanges > 2 {
                let valueRange = match.range(at: 2)
                if valueRange.location != NSNotFound, valueRange.length > 0 {
                    storage.addAttribute(
                        .foregroundColor,
                        value: palette.value,
                        range: Self.offset(valueRange, by: content.location)
                    )
                }
            }
            return
        }

        // A bare `Verse 2`. The parser treats this as a heading, so the editor shows
        // it as one — a writer who types headings this way should not have to guess
        // whether it was understood.
        if Self.plainHeader.firstMatch(in: line as String, range: whole) != nil {
            storage.addAttribute(.foregroundColor, value: palette.structure, range: content)
            storage.addAttribute(.font, value: boldFont, range: content)
            return
        }

        // Lyrics with inline chords.
        Self.chord.enumerateMatches(in: line as String, range: whole) { match, _, _ in
            guard let match = match, match.numberOfRanges > 1 else { return }
            let bracketed = Self.offset(match.range, by: content.location)
            let symbol = Self.offset(match.range(at: 1), by: content.location)
            storage.addAttribute(.foregroundColor, value: palette.punctuation, range: bracketed)
            storage.addAttribute(.foregroundColor, value: palette.chord, range: symbol)
            storage.addAttribute(.font, value: chordFont, range: symbol)
        }
    }

    // MARK: - Helpers

    /// The line's range with leading and trailing whitespace (and the line
    /// terminator) excluded, so the transcribed `^…$` patterns see what their JS
    /// originals see after `.trim()`.
    private static func trimmed(in text: NSString, range: NSRange) -> NSRange {
        let skip = CharacterSet.whitespacesAndNewlines
        var start = range.location
        var end = NSMaxRange(range)
        while start < end, let scalar = Unicode.Scalar(text.character(at: start)), skip.contains(scalar) {
            start += 1
        }
        while end > start, let scalar = Unicode.Scalar(text.character(at: end - 1)), skip.contains(scalar) {
            end -= 1
        }
        return NSRange(location: start, length: end - start)
    }

    private static func offset(_ range: NSRange, by delta: Int) -> NSRange {
        NSRange(location: range.location + delta, length: range.length)
    }
}
