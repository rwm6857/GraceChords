//
//  ChordProTextView.swift
//  GraceChords Studio
//
//  The ChordPro body's text view: `NSTextView` behind an `NSViewRepresentable`,
//  replacing the SwiftUI `TextEditor` this pane used to be.
//
//  The reason is the one the README named: `TextEditor` cannot style ranges, so
//  syntax highlighting needs a text view whose storage we can put attributes on.
//  Everything else here is the cost of that, kept as small as it can be — this file
//  owns *plumbing*, and `ChordProHighlighter` owns what the colours mean.
//
//  Three things this had to get right, all of them cheap to get wrong:
//
//  **Undo.** Highlighting never touches a character, only attributes, so it cannot
//  land in the undo stack. The quick-insert toolbar is the harder half: core hands
//  back a whole new body, and assigning that wholesale would replace the document
//  and flatten every undo step behind it. So an upstream change is reduced to the
//  contiguous edit it actually was (common prefix and suffix, in
//  `minimalReplacement`) and applied through `shouldChangeText(in:replacementString:)`,
//  which is what registers the undo. Core's edits *are* contiguous replacements, so
//  this reconstructs them exactly rather than approximating them — inserting `[G]`
//  costs one ⌘Z, and the typing before it survives.
//
//  **Marked text.** During Korean or Turkish composition the input method owns a
//  marked range and decorates it; re-colouring underneath it fights the IME and can
//  drop the composition underline. `hasMarkedText()` suspends highlighting until the
//  text is committed, at which point the commit's own edit re-colours the line. The
//  catalog has Turkish and Korean songs, so this is a real path, not a hypothetical.
//
//  **Selection.** The model publishes the caret as UTF-16 offsets because that is
//  what a JS string index means, and `NSRange` is UTF-16 already — so the conversion
//  `TextEditor` needed (`TextSelection` → `String.Index` → UTF-16) is gone rather
//  than reimplemented. That is a simplification the move paid for, not one it cost.
//

import AppKit
import SwiftUI

struct ChordProTextView: NSViewRepresentable {
    @Binding var text: String
    /// The caret or selection as UTF-16 offsets — the same units core's edit helpers
    /// index by. `nil` before the view has been focused.
    @Binding var selection: NSRange?

    /// Which document is in the editor. When it changes the body is replaced outright
    /// and the undo history is dropped — undoing across two different songs would
    /// paste one into the other.
    var documentID: UUID

    var fontSize: CGFloat = 12.5
    var lineSpacing: CGFloat = 2

    // MARK: - View lifecycle

    func makeNSView(context: Context) -> NSScrollView {
        // TextKit 1, constructed explicitly. A bare `NSTextView()` gets TextKit 2,
        // which works but re-derives its layout from the storage lazily and has had
        // attribute-invalidation bugs; the storage-delegate highlighting pattern
        // below is decades old on TextKit 1 and behaves identically on every macOS
        // this app runs on. Nothing here needs what TextKit 2 adds.
        let storage = NSTextStorage()
        let layoutManager = NSLayoutManager()
        storage.addLayoutManager(layoutManager)
        let container = NSTextContainer(size: NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.widthTracksTextView = true
        layoutManager.addTextContainer(container)

        let textView = ChordProNSTextView(frame: .zero, textContainer: container)
        textView.delegate = context.coordinator
        storage.delegate = context.coordinator
        context.coordinator.textView = textView

        textView.isEditable = true
        textView.isSelectable = true
        textView.allowsUndo = true
        // Plain text: no font panel, no ruler, and a paste that arrives as characters
        // rather than as somebody's web-page styling. The highlighter would normalise
        // pasted attributes on the next pass anyway, but not accepting them at all is
        // one less thing to be momentarily wrong.
        textView.isRichText = false
        textView.importsGraphics = false

        // Spelling and the automatic substitutions fight ChordPro constantly: {sov}
        // and [Bbmaj7] are not words, and quote substitution would turn a straight
        // apostrophe in a lyric into a curly one that the parser carries into the
        // chart. This is the same set the SwiftUI `.disableAutocorrection(true)` and
        // its neighbours used to cover, spelled out because AppKit has no one switch.
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isContinuousSpellCheckingEnabled = false
        textView.isGrammarCheckingEnabled = false
        textView.isAutomaticLinkDetectionEnabled = false
        textView.isAutomaticDataDetectionEnabled = false

        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [NSView.AutoresizingMask.width]
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: .greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainerInset = NSSize(width: GCSpacing.md, height: GCSpacing.sm)
        textView.drawsBackground = true

        textView.onEffectiveAppearanceChange = { [weak coordinator = context.coordinator] view in
            // Re-resolve the palette and repaint. Belt and braces next to AppKit's own
            // dynamic-colour resolution: whichever of the two is doing the work, a
            // flip of Appearance or Increase Contrast lands correctly.
            coordinator?.applyTheme(from: self, to: view, repaint: true)
        }

        let scrollView = NSScrollView()
        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = true

        context.coordinator.applyTheme(from: self, to: textView, repaint: false)
        context.coordinator.load(text, in: textView, documentID: documentID)
        if let selection = selection {
            textView.setSelectedRange(context.coordinator.clamp(selection, to: textView))
        }
        scrollView.backgroundColor = textView.backgroundColor

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? ChordProNSTextView else { return }
        // The coordinator outlives this struct, so it needs the current bindings
        // rather than the ones captured when it was made.
        context.coordinator.parent = self

        if context.coordinator.needsTheme(for: self) {
            context.coordinator.applyTheme(from: self, to: textView, repaint: true)
            scrollView.backgroundColor = textView.backgroundColor
        }

        if context.coordinator.documentID != documentID {
            context.coordinator.load(text, in: textView, documentID: documentID)
        } else if textView.string != text {
            context.coordinator.applyUpstreamText(text, to: textView)
        }

        if let selection = selection {
            let clamped = context.coordinator.clamp(selection, to: textView)
            if textView.selectedRange() != clamped {
                context.coordinator.withoutPublishing {
                    textView.setSelectedRange(clamped)
                    textView.scrollRangeToVisible(clamped)
                }
            }
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    // MARK: - Coordinator

    final class Coordinator: NSObject, NSTextViewDelegate, NSTextStorageDelegate {
        var parent: ChordProTextView
        weak var textView: ChordProNSTextView?

        private(set) var highlighter: ChordProHighlighter?
        /// The document currently loaded, so `updateNSView` can tell "a different song
        /// is open" from "the open song was edited".
        private(set) var documentID: UUID?
        /// The metrics the current highlighter was built with, so `updateNSView` can
        /// tell a real font change from SwiftUI simply calling it again.
        private var themedMetrics: (size: CGFloat, spacing: CGFloat)?

        /// Set while SwiftUI's value is being written *into* the view. Without it the
        /// resulting `textDidChange` would write straight back out, and a caret the
        /// model just moved would be overwritten by the caret it had before.
        private var isApplyingUpstream = false
        /// Re-entrancy guard for the storage delegate. Highlighting sets attributes,
        /// which posts another `didProcessEditing`; that one carries `.editedAttributes`
        /// only and is filtered out, but the flag makes the recursion impossible rather
        /// than merely unlikely.
        private var isHighlighting = false

        init(_ parent: ChordProTextView) {
            self.parent = parent
        }

        // MARK: Theme

        func needsTheme(for parent: ChordProTextView) -> Bool {
            guard let metrics = themedMetrics else { return true }
            return metrics.size != parent.fontSize || metrics.spacing != parent.lineSpacing
        }

        func applyTheme(from parent: ChordProTextView, to textView: ChordProNSTextView, repaint: Bool) {
            // Resolve the tokens against the view's own appearance. `GCColor` values
            // are dynamic `NSColor`s underneath (see Theme.swift), but going through
            // SwiftUI's `Color` on the way here can flatten one to whichever
            // appearance was current — doing it inside the drawing appearance means
            // "whichever" is the right one.
            var palette: ChordProHighlighter.Palette?
            var background = NSColor.textBackgroundColor
            textView.effectiveAppearance.performAsCurrentDrawingAppearance {
                palette = ChordProHighlighter.Palette(
                    body: NSColor(GCColor.ink),
                    chord: NSColor(GCColor.textAccent),
                    punctuation: NSColor(GCColor.muted),
                    structure: NSColor(GCColor.spotlight),
                    value: NSColor(GCColor.ink),
                    comment: NSColor(GCColor.muted)
                )
                background = NSColor(GCColor.bg)
            }
            guard let palette = palette else { return }

            let highlighter = ChordProHighlighter(
                palette: palette,
                size: parent.fontSize,
                lineSpacing: parent.lineSpacing
            )
            self.highlighter = highlighter
            self.themedMetrics = (parent.fontSize, parent.lineSpacing)

            textView.backgroundColor = background
            textView.insertionPointColor = palette.body
            // Newly typed text starts neutral instead of inheriting the colour of the
            // character before it — otherwise typing after a `]` would come out chord
            // blue until the next highlight pass caught up.
            textView.typingAttributes = highlighter.defaultAttributes

            if repaint, let storage = textView.textStorage {
                highlightAll(storage)
            }
        }

        // MARK: Text in

        /// Put a *different document* in the view: replace the body wholesale and
        /// forget the undo history, because none of it belongs to this song.
        func load(_ text: String, in textView: ChordProNSTextView, documentID: UUID) {
            self.documentID = documentID
            setWholeText(text, in: textView)
            textView.undoManager?.removeAllActions()
        }

        func setWholeText(_ text: String, in textView: ChordProNSTextView) {
            withoutPublishing {
                textView.string = text
                if let storage = textView.textStorage {
                    highlightAll(storage)
                }
            }
        }

        /// Push SwiftUI's value into the view as the edit it actually was.
        func applyUpstreamText(_ text: String, to textView: ChordProNSTextView) {
            let old = textView.string as NSString
            guard let (range, replacement) = ChordProTextView.minimalReplacement(from: old, to: text as NSString) else {
                return
            }
            withoutPublishing {
                // `shouldChangeText` is what registers the undo group; skipping it
                // would make a toolbar insert un-undoable. It can legitimately refuse
                // (a delegate veto, a read-only view), so its answer is honoured.
                guard textView.shouldChangeText(in: range, replacementString: replacement) else { return }
                textView.textStorage?.replaceCharacters(in: range, with: replacement)
                textView.didChangeText()
            }
            // The storage delegate highlighted the replaced span during that edit; if
            // the view was somehow bypassed, fall back to a full pass.
            if textView.string != text {
                setWholeText(text, in: textView)
            }
        }

        // MARK: Text out

        func textDidChange(_ notification: Notification) {
            guard !isApplyingUpstream, let textView = textView else { return }
            let value = textView.string
            if parent.text != value { parent.text = value }
            let range = textView.selectedRange()
            if parent.selection != range { parent.selection = range }
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !isApplyingUpstream, let textView = textView else { return }
            let range = textView.selectedRange()
            if parent.selection != range { parent.selection = range }
        }

        // MARK: Highlighting

        func textStorage(
            _ textStorage: NSTextStorage,
            didProcessEditing editedMask: NSTextStorageEditActions,
            range editedRange: NSRange,
            changeInLength delta: Int
        ) {
            guard editedMask.contains(.editedCharacters) else { return }
            guard !isHighlighting, let highlighter = highlighter else { return }
            // Leave a composition alone until the input method commits it. The commit
            // is itself a character edit, so the line is coloured a keystroke later
            // rather than not at all.
            if textView?.hasMarkedText() == true { return }
            isHighlighting = true
            highlighter.highlight(textStorage, in: editedRange)
            isHighlighting = false
        }

        private func highlightAll(_ storage: NSTextStorage) {
            guard !isHighlighting, let highlighter = highlighter else { return }
            isHighlighting = true
            storage.beginEditing()
            highlighter.highlight(storage, in: NSRange(location: 0, length: storage.length))
            storage.endEditing()
            isHighlighting = false
        }

        // MARK: Helpers

        func clamp(_ range: NSRange, to textView: NSTextView) -> NSRange {
            let length = (textView.string as NSString).length
            let location = max(0, min(range.location, length))
            return NSRange(location: location, length: max(0, min(range.length, length - location)))
        }

        func withoutPublishing(_ body: () -> Void) {
            let wasApplying = isApplyingUpstream
            isApplyingUpstream = true
            body()
            isApplyingUpstream = wasApplying
        }
    }

    // MARK: - Minimal replacement

    /// The single contiguous edit that turns `old` into `new`, or nil if they match.
    ///
    /// Common prefix and common suffix, in UTF-16 units — which is what `NSRange`
    /// speaks and what core's offsets mean. Both boundaries are then pulled back to a
    /// composed-character boundary so an edit next to an emoji or a combining mark
    /// cannot be split through the middle of one; the range only ever grows, so the
    /// result stays a correct (if occasionally one-character-wider) replacement.
    static func minimalReplacement(from old: NSString, to new: NSString) -> (NSRange, String)? {
        if old.isEqual(to: new as String) { return nil }

        let shared = min(old.length, new.length)
        var prefix = 0
        while prefix < shared, old.character(at: prefix) == new.character(at: prefix) {
            prefix += 1
        }
        var suffix = 0
        while suffix < shared - prefix,
              old.character(at: old.length - 1 - suffix) == new.character(at: new.length - 1 - suffix) {
            suffix += 1
        }

        // The prefix is identical in both strings, so backing it off to a boundary in
        // `old` backs it off to the same boundary in `new`. Same for the suffix.
        if prefix < old.length {
            prefix = old.rangeOfComposedCharacterSequence(at: prefix).location
        }
        if suffix > 0, old.length - suffix < old.length {
            let boundary = old.rangeOfComposedCharacterSequence(at: old.length - suffix).location
            suffix = old.length - boundary
        }

        let range = NSRange(location: prefix, length: old.length - prefix - suffix)
        let replacement = new.substring(with: NSRange(location: prefix, length: new.length - prefix - suffix))
        return (range, replacement)
    }
}

// MARK: - Appearance-aware text view

/// `NSTextView` that reports appearance flips, so the palette can be re-resolved.
final class ChordProNSTextView: NSTextView {
    var onEffectiveAppearanceChange: ((ChordProNSTextView) -> Void)?

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        onEffectiveAppearanceChange?(self)
    }
}
