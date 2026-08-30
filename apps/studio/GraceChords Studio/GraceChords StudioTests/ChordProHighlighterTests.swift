//
//  ChordProHighlighterTests.swift
//  GraceChords StudioTests
//
//  The highlighter is the one place Studio reads ChordPro without the bridge, so it
//  is also the one place where a Swift-side misreading can disagree with the parser
//  silently. These tests are that disagreement's alarm.
//

import AppKit
import Testing
@testable import GraceChords_Studio

@Suite("ChordPro highlighting")
struct ChordProHighlighterTests {
    /// Distinguishable, so a run can be named in a failure message.
    static let palette = ChordProHighlighter.Palette(
        body: .black, chord: .blue, punctuation: .gray,
        structure: .purple, value: .brown, comment: .darkGray
    )
    static let names: [NSColor: String] = [
        .black: "body", .blue: "chord", .gray: "punct",
        .purple: "structure", .brown: "value", .darkGray: "comment",
    ]

    static func highlighter() -> ChordProHighlighter {
        ChordProHighlighter(palette: palette, size: 12.5, lineSpacing: 2)
    }

    /// The colour name for each character, as a compact string: "bbb" etc.
    static func roles(_ body: String) -> [String] {
        let storage = NSTextStorage(string: body)
        highlighter().highlight(storage, in: NSRange(location: 0, length: storage.length))
        var result: [String] = []
        storage.enumerateAttribute(.foregroundColor, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
            let name = (value as? NSColor).flatMap { names[$0] } ?? "?"
            result.append(contentsOf: Array(repeating: name, count: range.length))
        }
        return result
    }

    static func role(_ body: String, at index: Int) -> String {
        roles(body)[index]
    }

    @Test("an inline chord colours its symbol and holds its brackets back")
    func inlineChord() {
        let body = "[G]Great"
        let roles = Self.roles(body)
        #expect(roles[0] == "punct")     // [
        #expect(roles[1] == "chord")     // G
        #expect(roles[2] == "punct")     // ]
        #expect(roles[3] == "body")      // G of "Great"
    }

    @Test("a chord inside a comment line is not a chord")
    func chordInsideComment() {
        // parser.ts skips the whole line, so colouring the [G] would say the opposite
        // of what the parser does with it.
        let body = "# not really a [G] chord"
        #expect(Set(Self.roles(body)) == ["comment"])
    }

    @Test("a directive splits into structure and value")
    func directiveSplit() {
        let body = "{title: Great Is Thy Faithfulness}"
        let roles = Self.roles(body)
        #expect(roles.first == "structure")
        #expect(roles.last == "structure")           // closing brace
        #expect(roles[body.distance(from: body.startIndex, to: body.range(of: "Great")!.lowerBound)] == "value")
    }

    @Test("a bare section header is structure")
    func bareHeader() {
        #expect(Set(Self.roles("Verse 2")) == ["structure"])
        // Not a header: the parser's RX_PLAIN_HEADER is anchored, so this is a lyric.
        #expect(Set(Self.roles("Verse of the day")) == ["body"])
    }

    @Test("an empty bracket pair is not a chord")
    func emptyBrackets() {
        // RX_CHORD requires at least one character inside.
        #expect(Set(Self.roles("[]")) == ["body"])
    }

    @Test("section directives are bold and metadata directives are not")
    func sectionDirectivesAreBold() {
        func isBold(_ body: String) -> Bool {
            let storage = NSTextStorage(string: body)
            Self.highlighter().highlight(storage, in: NSRange(location: 0, length: storage.length))
            let font = storage.attribute(.font, at: 0, effectiveRange: nil) as? NSFont
            return font?.fontDescriptor.symbolicTraits.contains(.bold) ?? false
        }
        #expect(isBold("{start_of_verse: Verse 1}"))
        #expect(isBold("{soc}"))
        #expect(isBold("Chorus"))
        #expect(!isBold("{title: Anything}"))
    }

    @Test("re-highlighting one line matches a full pass")
    func incrementalMatchesFull() {
        // The load-bearing claim: line scoping is exact, not an approximation that
        // drifts as the body is edited.
        let body = """
        {title: Test}
        # a note
        {start_of_verse}
        [G]One [C]two
        {end_of_verse}
        Chorus
        [D]Three
        """
        let incremental = NSTextStorage(string: body)
        let highlighter = Self.highlighter()
        highlighter.highlight(incremental, in: NSRange(location: 0, length: incremental.length))
        // Touch each line the way an edit would, one at a time.
        for range in LintLocator.lineRanges(in: body) {
            highlighter.highlight(incremental, in: NSRange(location: range.location, length: 0))
        }

        let full = NSTextStorage(string: body)
        highlighter.highlight(full, in: NSRange(location: 0, length: full.length))
        #expect(incremental.isEqual(to: full))
    }

    @Test("highlighting a range past the end does not trap")
    func outOfRangeIsClamped() {
        let storage = NSTextStorage(string: "[G]hi")
        Self.highlighter().highlight(storage, in: NSRange(location: 99, length: 40))
        #expect(storage.length == 5)
    }

    @Test("an empty body is left alone")
    func emptyBody() {
        let storage = NSTextStorage(string: "")
        Self.highlighter().highlight(storage, in: NSRange(location: 0, length: 0))
        #expect(storage.length == 0)
    }
}
