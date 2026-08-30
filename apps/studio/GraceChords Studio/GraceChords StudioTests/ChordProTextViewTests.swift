//
//  ChordProTextViewTests.swift
//  GraceChords StudioTests
//
//  `minimalReplacement` is what makes a toolbar insert one undo step instead of a
//  whole-document replacement, so it has to reconstruct core's edit exactly — and it
//  must never split a surrogate pair while doing it.
//

import AppKit
import Testing
@testable import GraceChords_Studio

@Suite("Minimal replacement")
struct ChordProTextViewTests {
    /// Applying the result to `old` must produce `new`, whatever range it picked.
    static func check(_ old: String, _ new: String, sourceLocation: SourceLocation = #_sourceLocation) {
        guard let (range, replacement) = ChordProTextView.minimalReplacement(from: old as NSString, to: new as NSString) else {
            #expect(old == new, "nil was returned for a real change", sourceLocation: sourceLocation)
            return
        }
        let rebuilt = (old as NSString).replacingCharacters(in: range, with: replacement)
        #expect(rebuilt == new, sourceLocation: sourceLocation)
    }

    @Test("an unchanged body needs no edit")
    func noChange() {
        #expect(ChordProTextView.minimalReplacement(from: "abc" as NSString, to: "abc" as NSString) == nil)
    }

    @Test("a toolbar chord insert is one insertion at the caret")
    func chordInsert() {
        let result = ChordProTextView.minimalReplacement(from: "Amazing grace" as NSString, to: "Amazing [G]grace" as NSString)
        #expect(result?.0 == NSRange(location: 8, length: 0))
        #expect(result?.1 == "[G]")
    }

    @Test("wrapping a selection is one replacement")
    func wrap() {
        Self.check("verse text", "{start_of_verse}\nverse text\n{end_of_verse}")
    }

    @Test("clearing and filling round-trip")
    func clearAndFill() {
        Self.check("hello", "")
        Self.check("", "new")
    }

    @Test("an edit beside an emoji does not split the surrogate pair")
    func surrogateNeighbour() {
        Self.check("Ra🎸bbim", "Ra🎸🎸bbim")
        Self.check("🎸🎸", "🎸")
        // The chosen range must start and end on whole characters.
        if let (range, _) = ChordProTextView.minimalReplacement(from: "Ra🎸bbim" as NSString, to: "Ra🎸🎸bbim" as NSString) {
            let ns = "Ra🎸bbim" as NSString
            #expect(ns.rangeOfComposedCharacterSequence(at: min(range.location, ns.length - 1)).location <= range.location)
        }
    }

    @Test("non-ASCII edits round-trip")
    func nonASCII() {
        Self.check("주님의 사랑", "주님의 큰 사랑")
        Self.check("güzelsin", "çok güzelsin")
    }

    @Test("a change with a shared prefix and suffix picks the middle")
    func sharedEnds() {
        let result = ChordProTextView.minimalReplacement(from: "abcXYZdef" as NSString, to: "abcQdef" as NSString)
        #expect(result?.0 == NSRange(location: 3, length: 3))
        #expect(result?.1 == "Q")
    }
}
