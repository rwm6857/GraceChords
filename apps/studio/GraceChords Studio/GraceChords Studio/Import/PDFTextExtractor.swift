//
//  PDFTextExtractor.swift
//  GraceChords Studio
//
//  Positioned text out of a PDF, for the editor's import. Text and geometry only —
//  every decision about what the text MEANS (chord line or lyric, where a section
//  starts, which syllable a chord belongs to) lives in
//  packages/core/src/songs/pdfImport.ts, reached through CoreBridge.
//
//  ── Why PDFSelection and not characterBounds(at:) ────────────────────────────
//  The obvious API for "where is each glyph" is `PDFPage.characterBounds(at:)`, and
//  it is the wrong one. It has regressed twice: FB14843671 (open — wrong
//  coordinates from iOS 18 beta 4 through at least 18.5) and FB12951475 against the
//  sibling `characterIndex(at:)` in shipping iOS 17, whose reported signature was
//  "accuracy worsening further down the page" — a cumulative index drift. PDFKit is
//  one implementation across iOS and macOS, and the failure is SILENT: the rects
//  look plausible and belong to the wrong row, which for a chord sheet means chords
//  landing confidently in the wrong place.
//
//  So line and word geometry come from PDFSelection (`selectionsByLine()`,
//  `rangeAtIndex(_:onPage:)`, `bounds(for:)`), which the same reports find more
//  reliable and which needs no per-glyph index trust. Per-character bounds is used
//  in exactly one place — resolving a mid-word chord split inside a word already
//  located — where each rect is checked against its enclosing word rect before it
//  is trusted, and the whole attempt is abandoned if it does not fit.
//
//  ── Fragments ────────────────────────────────────────────────────────────────
//  A real chord chart does not store a lyric line as one text run. PraiseCharts and
//  OnSong emit a separate positioned run under each chord, so one visual line
//  arrives as several ranges on a single `selectionsByLine()` selection — 43 of 77
//  lines in one chart, 78 of 129 in another. Treating each range as its own line is
//  fatal: every chord line then has no lyric line beneath it to pair with, and the
//  multi-range count stops meaning "PDFKit merged two columns" because it is true of
//  ordinary lines too.
//
//  So fragments are merged back into one line here, joined with single spaces, and
//  each word keeps its true rect. Nothing downstream reads horizontal position out
//  of the text — the aligner works from `word.x` — so collapsing the whitespace
//  costs nothing and keeps lyrics clean. A line is split again only at a detected
//  gutter, and only when it really has a gap there.
//
//  Not thread-safe. Run `extract` off the main thread, then hop back to the main
//  thread for the bridge call.
//

import AppKit
import Foundation
import PDFKit

enum PDFImportError: Error, LocalizedError {
    case unreadable(reason: String)
    case locked
    case copyingRestricted
    case noPages
    case noExtractableText

    var errorDescription: String? {
        switch self {
        case .unreadable(let reason):
            return "That PDF could not be opened: \(reason)"
        case .locked:
            return "That PDF is password-protected. Open it and re-save it without a password first."
        case .copyingRestricted:
            return "That PDF does not allow text extraction, so its words cannot be read."
        case .noPages:
            return "That PDF has no pages."
        case .noExtractableText:
            return """
            That PDF has no extractable text — it is most likely a scan or a photo of a \
            chart. Import works on PDFs whose text can be selected.
            """
        }
    }
}

/// `nonisolated` is load-bearing, not decoration: the target builds with
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, so without it this type would be
/// implicitly main-actor and `Task.detached` would hop straight back to the main
/// thread — reading a long chart on the same run loop as the typing it is meant to
/// stay out of. It holds no state, so there is nothing for the isolation to protect.
nonisolated struct PDFTextExtractor {
    /// Mid-word placement needs a word at least this long, so shorter words are
    /// never measured per character.
    private static let midWordMinimumLength = 5
    /// A gutter must be at least this fraction of the body's width.
    private static let minimumGutterFraction = 0.04
    /// A second column has to start at least this far across the body. Below it, a
    /// cluster of line starts is a hanging indent, not a column.
    private static let secondColumnMinimumOffset = 0.35
    /// Page furniture band at the top and bottom of the crop box.
    private static let furnitureBandFraction = 0.08

    /// Read `url` into the shape `CoreBridge.pdfDraft(from:)` consumes.
    ///
    /// Loaded through `Data` rather than `PDFDocument(url:)` so no security-scoped
    /// resource has to stay alive for the document's lifetime — the open panel's
    /// grant covers the read and nothing after it.
    static func extract(from url: URL) throws -> PDFExtraction {
        // `.fileImporter` hands back a security-scoped URL: the entitlement says the
        // app MAY read user-selected files, and this is what says WHICH one. Reading
        // without it works often enough to look fine and fails on sandboxed builds.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            throw PDFImportError.unreadable(reason: error.localizedDescription)
        }
        return try extract(from: data)
    }

    /// Read bytes that have already been obtained.
    ///
    /// The drag-and-drop path needs this: a file URL off the dragging pasteboard carries
    /// no sandbox grant at all, so the bytes have to be fetched through the item
    /// provider instead and arrive here as `Data`.
    static func extract(from data: Data) throws -> PDFExtraction {
        guard let document = PDFDocument(data: data) else {
            throw PDFImportError.unreadable(reason: "the file is not a PDF")
        }
        // Both gates are real for downloaded charts, and PDFDocument opens a locked
        // document happily — it just answers nil for the text.
        if document.isLocked { throw PDFImportError.locked }
        if !document.allowsCopying { throw PDFImportError.copyingRestricted }
        guard document.pageCount > 0 else { throw PDFImportError.noPages }

        var lines: [PDFExtractedLine] = []
        var pages: [PDFExtractedPage] = []
        var diagnostics: [String] = []

        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            let result = extractPage(page, index: index)
            lines.append(contentsOf: result.lines)
            pages.append(result.page)
            diagnostics.append(contentsOf: result.diagnostics)
        }

        guard !lines.isEmpty else { throw PDFImportError.noExtractableText }
        return PDFExtraction(lines: lines, pages: pages, diagnostics: diagnostics)
    }

    // MARK: - Intermediate model

    /// One word, before its line's text has been assembled.
    private struct RawWord {
        var text: String
        var rect: CGRect
        /// Range in `page.string`, kept so per-character metrics can be measured
        /// through `selection(for:)` after the words have been reordered.
        var pageRange: NSRange
        /// True when the rect was interpolated inside its fragment because PDFKit gave
        /// no rect for this word. Such a word is placed but never measured per
        /// character — an interpolated position is not precise enough to split a word on.
        var isEstimated: Bool
    }

    /// A line before columns are assigned and its text is built. Words are held
    /// rather than a string so a column split can repartition them without having to
    /// unpick offsets.
    private struct RawLine {
        var words: [RawWord]
        var fontSize: Double?
        var isBold: Bool?
        var column: Int?

        var rect: CGRect {
            words.dropFirst().reduce(words[0].rect) { $0.union($1.rect) }
        }
    }

    private struct PageResult {
        var lines: [PDFExtractedLine]
        var page: PDFExtractedPage
        var diagnostics: [String]
    }

    // MARK: - One page

    private static func extractPage(_ page: PDFPage, index: Int) -> PageResult {
        let bounds = page.bounds(for: .cropBox)
        let transform = page.transform(for: .cropBox)
        let pageNumber = index + 1
        var diagnostics: [String] = []

        func result(_ lines: [PDFExtractedLine], columns: Int, trusted: Bool) -> PageResult {
            PageResult(
                lines: lines,
                page: PDFExtractedPage(
                    index: index,
                    width: Double(bounds.width),
                    height: Double(bounds.height),
                    columnCount: columns,
                    layoutTrusted: trusted
                ),
                diagnostics: diagnostics
            )
        }

        guard let text = page.string as NSString?, text.length > 0 else {
            return result([], columns: 1, trusted: true)
        }
        // `string` and `numberOfCharacters` are documented to cover the same
        // synthesized content, so a mismatch means this page's index space — which
        // every rect lookup goes through — cannot be trusted.
        if page.numberOfCharacters != text.length {
            diagnostics.append(
                "page \(pageNumber): PDFKit reported \(page.numberOfCharacters) characters for a \(text.length)-character string"
            )
        }
        if isLikelyGarbledText(text) {
            diagnostics.append("page \(pageNumber): the extracted text looks garbled; the fonts may lack a Unicode mapping")
        }
        guard let whole = page.selection(for: NSRange(location: 0, length: text.length)) else {
            return result([], columns: 1, trusted: true)
        }

        let attributed = page.attributedString

        // Every word on the page first, then grouped into visual lines by baseline.
        //
        // The grouping cannot be left to `selectionsByLine()`: on these charts it
        // returns one selection PER FRAGMENT, so a lyric line broken into three
        // positioned runs arrives as three "lines" with one text range each. Trusting
        // it left 43 of 77 lines on one chart split apart, which meant no chord line
        // had a lyric line under it to pair with.
        var allWords: [RawWord] = []
        var estimatedWords = 0
        for lineSelection in whole.selectionsByLine() {
            let rangeCount = lineSelection.numberOfTextRanges(on: page)
            guard rangeCount > 0 else { continue }
            for position in 0..<rangeCount {
                let range = lineSelection.range(at: position, on: page)
                guard range.length > 0, range.location >= 0, range.location + range.length <= text.length else {
                    diagnostics.append("page \(pageNumber): a line range fell outside the page string")
                    continue
                }
                allWords.append(
                    contentsOf: words(in: range, page: page, transform: transform, text: text, estimated: &estimatedWords)
                )
            }
        }
        guard !allWords.isEmpty else { return result([], columns: 1, trusted: true) }
        if estimatedWords > 0 {
            diagnostics.append("page \(pageNumber): \(estimatedWords) word(s) had no rect of their own and were placed by interpolation")
        }

        var reordered = 0
        var raw: [RawLine] = []
        for group in groupIntoLines(allWords) {
            // Visual order, not content-stream order. Nothing in PDFKit promises
            // `page.string` runs left to right, and these fragments frequently do not.
            if !group.indices.dropFirst().allSatisfy({ group[$0].pageRange.location > group[$0 - 1].pageRange.location }) {
                reordered += 1
            }
            let style = fontStyle(in: attributed, ranges: group.map(\.pageRange))
            raw.append(RawLine(words: group, fontSize: style.size, isBold: style.isBold, column: nil))
        }

        guard !raw.isEmpty else { return result([], columns: 1, trusted: true) }
        if reordered > 0 {
            diagnostics.append("page \(pageNumber): \(reordered) line(s) read left to right in a different order than the PDF stores them")
        }

        // Only genuinely tiny text is removed here. Deciding what is a header or a
        // footer is core's job, not this file's — and it matters: on a real chart the
        // key and tempo share a line with the publisher's URL, so dropping that line
        // as furniture threw away the song's key before core could read it. This layer
        // supplies geometry; core decides what the text means.
        let modalSize = modalFontSize(raw)
        var working = raw.filter { !isTinyText($0, modalSize: modalSize) }
        if working.isEmpty { working = raw }
        // Named, not just counted: a line dropped here disappears without a trace
        // otherwise, and that is exactly the failure Copy Diagnostics has to reveal.
        for dropped in raw where !working.contains(where: { $0.rect == dropped.rect }) {
            let text = dropped.words.map(\.text).joined(separator: " ")
            diagnostics.append("page \(pageNumber): dropped as a diagram or footnote — \(text.prefix(60))")
        }

        let layout = detectColumns(&working, in: bounds, modalSize: modalSize)
        if let note = layout.diagnostic { diagnostics.append("page \(pageNumber): \(note)") }

        let ordered = readingOrder(working, columnCount: layout.columnCount)
        let lines = ordered.enumerated().map { position, line in
            finalize(
                line,
                page: page,
                transform: transform,
                pageIndex: index,
                startsBlock: startsBlock(at: position, in: ordered),
                cropBox: bounds
            )
        }
        return result(lines, columns: layout.columnCount, trusted: layout.trusted)
    }

    // MARK: - Words

    /// Whitespace-delimited words of one text range, each with its own rect.
    ///
    /// Positions come from `selection(for:)` per word rather than from the text: PDFKit
    /// synthesizes spaces on an internal threshold, so `G    C` may arrive as `G C` or
    /// `GC`. Every horizontal measurement in this file is geometric for that reason.
    private static func words(
        in range: NSRange,
        page: PDFPage,
        transform: CGAffineTransform,
        text: NSString,
        estimated: inout Int
    ) -> [RawWord] {
        let fragment = normalizeAccidentals(text.substring(with: range)) as NSString
        // The fragment's own rect, so a word whose selection yields nothing can still
        // be placed proportionally instead of disappearing. Dropping such words looks
        // harmless and is not: one real chart lost its entire `Key: A · Capo: 2` line
        // that way, silently, because every word in it failed the same lookup.
        let fragmentRect = rect(for: range, page: page, transform: transform)
        var out: [RawWord] = []
        var cursor = 0

        while cursor < fragment.length {
            let remainder = NSRange(location: cursor, length: fragment.length - cursor)
            let start = fragment.rangeOfCharacter(from: .whitespacesAndNewlines.inverted, options: [], range: remainder)
            guard start.location != NSNotFound else { break }
            let tail = NSRange(location: start.location, length: fragment.length - start.location)
            let space = fragment.rangeOfCharacter(from: .whitespacesAndNewlines, options: [], range: tail)
            let end = space.location == NSNotFound ? fragment.length : space.location
            let local = NSRange(location: start.location, length: end - start.location)
            cursor = end

            let pageRange = NSRange(location: range.location + local.location, length: local.length)
            var wasEstimated = false
            var rect = self.rect(for: pageRange, page: page, transform: transform)
            if rect == nil, let fragmentRect {
                // Proportional within the fragment. Loses sub-word accuracy, which is
                // why no charX is offered for such a word — placement degrades to the
                // word start rather than being invented.
                let advance = fragmentRect.width / CGFloat(max(1, fragment.length))
                rect = CGRect(
                    x: fragmentRect.minX + advance * CGFloat(local.location),
                    y: fragmentRect.minY,
                    width: advance * CGFloat(local.length),
                    height: fragmentRect.height
                )
                estimated += 1
                wasEstimated = true
            }
            guard let rect else { continue }
            out.append(
                RawWord(
                    text: fragment.substring(with: local),
                    rect: rect,
                    pageRange: pageRange,
                    isEstimated: wasEstimated
                )
            )
        }
        return out
    }

    /// Words → visual lines, grouped on the vertical centre of their rects and sorted
    /// left to right within each line.
    ///
    /// The tolerance is relative to the glyph height so it holds at any point size: a
    /// chord line sits roughly one-and-a-half glyph heights above its lyrics, while
    /// fragments of one line share a baseline exactly. Two columns whose rows happen
    /// to be a fraction of a point apart do get merged here — that is harmless,
    /// because `detectColumns` splits them again at the gutter, and it is what lets a
    /// heading in each column be recognised as two headings rather than one line.
    private static func groupIntoLines(_ words: [RawWord]) -> [[RawWord]] {
        let heights = words.map(\.rect.height).sorted()
        let median = heights[heights.count / 2]
        let tolerance = max(2, median * 0.45)

        var lines: [[RawWord]] = []
        var current: [RawWord] = []
        var anchor: CGFloat = 0

        for word in words.sorted(by: { $0.rect.midY > $1.rect.midY }) {
            if current.isEmpty {
                anchor = word.rect.midY
            } else if abs(word.rect.midY - anchor) > tolerance {
                lines.append(current.sorted { $0.rect.minX < $1.rect.minX })
                current = []
                anchor = word.rect.midY
            }
            current.append(word)
        }
        if !current.isEmpty { lines.append(current.sorted { $0.rect.minX < $1.rect.minX }) }
        return lines
    }

    private static func rect(for range: NSRange, page: PDFPage, transform: CGAffineTransform) -> CGRect? {
        guard let selection = page.selection(for: range) else { return nil }
        let rect = selection.bounds(for: page).applying(transform)
        guard rect.isFinite, rect.width > 0, rect.height > 0 else { return nil }
        return rect
    }

    /// Assemble a line's words into the text plus offsets the bridge contract wants.
    ///
    /// Single spaces between words: the offsets have to index this string, and no
    /// consumer reads position out of it — `word.x` carries that.
    private static func finalize(
        _ line: RawLine,
        page: PDFPage,
        transform: CGAffineTransform,
        pageIndex: Int,
        startsBlock: Bool,
        cropBox: CGRect
    ) -> PDFExtractedLine {
        var text = ""
        var words: [PDFExtractedWord] = []

        for word in line.words {
            if !text.isEmpty { text += " " }
            let start = text.utf16.count
            text += word.text
            let end = text.utf16.count
            words.append(
                PDFExtractedWord(
                    text: word.text,
                    x: Double(word.rect.minX),
                    y: Double(cropBox.maxY - word.rect.maxY),
                    w: Double(word.rect.width),
                    h: Double(word.rect.height),
                    start: start,
                    end: end,
                    charX: !word.isEstimated && end - start >= midWordMinimumLength
                        ? characterOrigins(word.pageRange, page: page, transform: transform, within: word.rect)
                        : nil
                )
            )
        }

        let rect = line.rect
        return PDFExtractedLine(
            text: text,
            words: words,
            x: Double(rect.minX),
            // Flip to top-down so "above" is "smaller y" on both sides of the bridge.
            y: Double(cropBox.maxY - rect.maxY),
            w: Double(rect.width),
            h: Double(rect.height),
            fontSize: line.fontSize,
            isBold: line.isBold,
            page: pageIndex,
            column: line.column,
            startsBlock: startsBlock
        )
    }

    /// Left edge of each character of a word, or nil if it cannot be trusted.
    ///
    /// The ONE use of per-character geometry, and it validates rather than assumes:
    /// every rect must sit inside the word it came from and advance left to right.
    /// `characterBounds(at:)` is avoided even here — `selection(for:)` over a
    /// one-character range is the same information through the API that has not
    /// regressed. nil makes core snap to the word start, so a bad measurement costs
    /// precision and never correctness.
    private static func characterOrigins(
        _ range: NSRange,
        page: PDFPage,
        transform: CGAffineTransform,
        within word: CGRect
    ) -> [Double]? {
        let slack = word.insetBy(dx: -word.width, dy: -word.height)
        var origins: [Double] = []
        origins.reserveCapacity(range.length)
        var previous = -Double.greatestFiniteMagnitude

        for offset in 0..<range.length {
            let single = NSRange(location: range.location + offset, length: 1)
            guard let rect = rect(for: single, page: page, transform: transform) else { return nil }
            guard slack.intersects(rect) else { return nil }
            let x = Double(rect.minX)
            if x < previous - 0.5 { return nil }
            previous = x
            origins.append(x)
        }
        guard let first = origins.first, let last = origins.last,
              abs(first - Double(word.minX)) <= word.width * 0.25,
              last <= Double(word.maxX) + 1
        else { return nil }
        return origins
    }

    // MARK: - Fonts

    /// Modal point size and boldness across a line's runs.
    ///
    /// Core uses these to resolve chord lines the token ratio alone gets wrong: a
    /// chord line is very often bold, or set smaller than the lyrics.
    private static func fontStyle(in attributed: NSAttributedString?, ranges: [NSRange]) -> (size: Double?, isBold: Bool?) {
        guard let attributed else { return (nil, nil) }
        var sizes: [Double: Int] = [:]
        var boldLength = 0
        var total = 0

        for range in ranges where range.location + range.length <= attributed.length {
            attributed.enumerateAttribute(.font, in: range, options: []) { value, subrange, _ in
                guard let font = value as? NSFont else { return }
                sizes[Double(font.pointSize), default: 0] += subrange.length
                total += subrange.length
                if font.fontDescriptor.symbolicTraits.contains(.bold) { boldLength += subrange.length }
            }
        }
        guard total > 0 else { return (nil, nil) }
        return (sizes.max { $0.value < $1.value }?.key, Double(boldLength) / Double(total) > 0.6)
    }

    /// Modal point size across a page — what "body text" means here.
    private static func modalFontSize(_ lines: [RawLine]) -> Double? {
        var weights: [Double: Int] = [:]
        for line in lines {
            guard let size = line.fontSize, size > 0 else { continue }
            weights[(size * 2).rounded() / 2, default: 0] += line.words.reduce(0) { $0 + $1.text.count }
        }
        return weights.max { $0.value < $1.value }?.key
    }

    /// Body text, for reading the page's layout: a title set larger than the body and
    /// a footer set smaller are both excluded.
    private static func isBodyText(_ line: RawLine, modalSize: Double?) -> Bool {
        guard let modalSize, modalSize > 0, let size = line.fontSize else { return true }
        return size >= modalSize * 0.85 && size <= modalSize * 1.2
    }

    // MARK: - Columns

    private struct Layout {
        var columnCount: Int
        var trusted: Bool
        var diagnostic: String?
    }

    /// Assign `column`, splitting lines PDFKit merged across the gutter.
    ///
    /// Columns are found by clustering where body lines START. That is the signal a
    /// two-column chart actually gives — every line begins at one of two x positions —
    /// and unlike a zero-coverage gap in an x-projection profile it survives the
    /// full-width lines every chart has (title, credits, footer), which fill the
    /// gutter in a profile and hide it completely.
    private static func detectColumns(_ lines: inout [RawLine], in content: CGRect, modalSize: Double?) -> Layout {
        // Header and footer lines are excluded from the EVIDENCE without being removed
        // from the document: a full-width footer fills the gutter in any horizontal
        // measurement and hides it completely.
        let body = lines.filter { isBodyText($0, modalSize: modalSize) && !isFurniture($0, in: content, modalSize: modalSize) }
        guard body.count >= 6 else { return Layout(columnCount: 1, trusted: true, diagnostic: nil) }

        let left = body.map(\.rect.minX).min() ?? 0
        let right = body.map(\.rect.maxX).max() ?? 0
        let width = right - left
        guard width > 0 else { return Layout(columnCount: 1, trusted: true, diagnostic: nil) }

        // Cluster line starts, breaking whenever two consecutive starts are further
        // apart than a gutter.
        let starts = body.map(\.rect.minX).sorted()
        let breakWidth = width * CGFloat(minimumGutterFraction) * 2
        var clusters: [[CGFloat]] = [[starts[0]]]
        for start in starts.dropFirst() {
            if start - (clusters[clusters.count - 1].last ?? start) > breakWidth {
                clusters.append([start])
            } else {
                clusters[clusters.count - 1].append(start)
            }
        }

        // Indents make small clusters; a column is a big one that begins well across
        // the body.
        let candidates = clusters.filter { $0.count >= 3 }
        guard candidates.count >= 2 else { return Layout(columnCount: 1, trusted: true, diagnostic: nil) }
        if candidates.count > 2 {
            return Layout(
                columnCount: 1,
                trusted: false,
                diagnostic: "\(candidates.count) columns of text — layout not understood, chords left on their own lines"
            )
        }
        guard let secondStart = candidates[1].first,
              secondStart - left >= width * CGFloat(secondColumnMinimumOffset)
        else {
            return Layout(columnCount: 1, trusted: true, diagnostic: nil)
        }

        // Just left of the second column's edge, so its own lines fall cleanly to the
        // right of it.
        let split = secondStart - 1

        // The gutter proper: from the right edge of the widest line that stays in the
        // left column, across to where the right column begins. A line may only be cut
        // in two if it has NO word in there.
        //
        // Gap WIDTH alone is not enough, and getting that wrong is expensive: a
        // credits block or a wide title runs continuously across the whole page, and
        // some ordinary inter-word gap in it lands near the gutter and exceeds any
        // width threshold — which cut the title of one real chart in half.
        let leftOnly = lines.filter { line in line.words.allSatisfy { $0.rect.maxX <= split } }
        let gutterLo = min(leftOnly.compactMap { $0.words.map(\.rect.maxX).max() }.max() ?? split, split)
        var assigned: [RawLine] = []

        for line in lines {
            let before = line.words.filter { $0.rect.maxX <= split }
            let after = line.words.filter { $0.rect.minX > split }

            guard !before.isEmpty, !after.isEmpty else {
                var line = line
                line.column = line.words[0].rect.minX > split ? 1 : 0
                assigned.append(line)
                continue
            }

            let occupiesGutter = line.words.contains { $0.rect.maxX > gutterLo && $0.rect.minX < secondStart }
            if occupiesGutter {
                // Genuinely full width — a title band, a credits block, a footer.
                var line = line
                line.column = nil
                assigned.append(line)
            } else {
                assigned.append(RawLine(words: before, fontSize: line.fontSize, isBold: line.isBold, column: 0))
                assigned.append(RawLine(words: after, fontSize: line.fontSize, isBold: line.isBold, column: 1))
            }
        }

        lines = assigned
        return Layout(columnCount: 2, trusted: true, diagnostic: nil)
    }

    /// Header band, then column-major, then footer band. Top down within each group.
    ///
    /// `page.string`'s own order is never trusted: nothing in PDFKit guarantees it is
    /// visual rather than content-stream order. Everything downstream reads only
    /// (string, rect) pairs this has already sorted, so that guarantee is not needed.
    ///
    /// A full-width line is only hoisted out of the flow when it sits ABOVE or BELOW
    /// the columns. One in the middle — a lyric line reaching under a chord diagram, a
    /// wide chord run — stays where it is, in the left column's flow. Hoisting every
    /// spanning line to the top put a lyric from halfway down one chart above its own
    /// title.
    private static func readingOrder(_ lines: [RawLine], columnCount: Int) -> [RawLine] {
        let topDown: (RawLine, RawLine) -> Bool = { $0.rect.maxY > $1.rect.maxY }
        guard columnCount > 1 else { return lines.sorted(by: topDown) }

        let columnLines = lines.filter { $0.column != nil }
        let top = columnLines.map(\.rect.maxY).max() ?? .greatestFiniteMagnitude
        let bottom = columnLines.map(\.rect.minY).min() ?? -.greatestFiniteMagnitude

        var header: [RawLine] = []
        var footer: [RawLine] = []
        var flow = columnLines

        for line in lines where line.column == nil {
            if line.rect.maxY > top {
                header.append(line)
            } else if line.rect.minY < bottom {
                footer.append(line)
            } else {
                var line = line
                line.column = 0
                flow.append(line)
            }
        }

        let columns = (0..<columnCount).map { column in
            flow.filter { $0.column == column }.sorted(by: topDown)
        }
        return header.sorted(by: topDown) + columns.flatMap { $0 } + footer.sorted(by: topDown)
    }

    /// True for the first line of a page or of a column. The pitch preceding such a
    /// line is a layout artifact, so core must not read a stanza break from it.
    private static func startsBlock(at position: Int, in lines: [RawLine]) -> Bool {
        guard position > 0 else { return true }
        return lines[position].column != lines[position - 1].column
    }

    // MARK: - Furniture

    // There is deliberately NO "drop lines repeated across pages" rule, and it should
    // not be added. It reads as the obvious way to catch a running head, and it
    // destroys real content: a chart whose every line sits under an `A` has that chord
    // line near the top of every page, so "in the band and repeated" removed one chord
    // from every section — silently, since the lyrics survived. Restricting it to the
    // band was not enough, because a continuation page's first lines ARE in the band.
    //
    // `isFurniture` carries the load instead: band membership AND either furniture
    // wording or a markedly smaller font. That cannot eat body text, and it runs per
    // page, early enough to keep a footer out of the column evidence.

    /// Text far smaller than the body: a chord-fingering diagram, a footnote, a
    /// footer. In a chord chart the body and the chord row are the only two sizes that
    /// carry the song, and the threshold sits below the chord row's own ratio
    /// (typically ~0.92 of the body) so chords are never caught by it.
    ///
    /// This is the one content judgement made here rather than in core, because it
    /// needs the page's modal point size — which core cannot compute for a page it
    /// only sees line by line.
    private static func isTinyText(_ line: RawLine, modalSize: Double?) -> Bool {
        guard let modalSize, modalSize > 0, let size = line.fontSize else { return false }
        return size < modalSize * 0.75
    }

    /// A running head, footer or copyright line — used only to keep such a line out of
    /// the column evidence. Core decides whether it belongs in the body.
    private static func isFurniture(_ line: RawLine, in content: CGRect, modalSize: Double?) -> Bool {
        guard isFurnitureBand(line.rect, in: content) else { return false }
        if looksLikeFurniture(line.words.map(\.text).joined(separator: " ")) { return true }
        guard let modalSize, modalSize > 0, let size = line.fontSize else { return false }
        return size < modalSize * 0.8
    }

    private static func isFurnitureBand(_ rect: CGRect, in content: CGRect) -> Bool {
        let band = content.height * furnitureBandFraction
        return rect.maxY > content.maxY - band || rect.minY < content.minY + band
    }

    /// A light second opinion on the band test. Core strips furniture by content too;
    /// this only keeps a header or footer out of the column evidence, so it errs
    /// toward keeping the line.
    private static func looksLikeFurniture(_ text: String) -> Bool {
        let lowered = text.lowercased()
        if lowered.contains("ccli") || lowered.contains("copyright") || lowered.contains("©") { return true }
        if lowered.contains("http://") || lowered.contains("https://") || lowered.contains("www.") { return true }
        if text.range(of: #"^\s*(page\s*)?\d+(\s*(of|/)\s*\d+)?\s*$"#, options: .regularExpression) != nil { return true }
        return false
    }

    /// A font with no usable Unicode mapping yields text that is structurally fine and
    /// semantically garbage, which is worth saying out loud rather than importing.
    private static func isLikelyGarbledText(_ text: NSString) -> Bool {
        let sample = text.substring(to: min(text.length, 2000))
        guard !sample.isEmpty else { return false }
        let allowed = CharacterSet.alphanumerics
            .union(.whitespacesAndNewlines)
            .union(CharacterSet(charactersIn: "#b/|()[]{}.,:;'’\"-–—&·*+!?%°ø"))
        let bad = sample.unicodeScalars.reduce(0) { $0 + (allowed.contains($1) ? 0 : 1) }
        return Double(bad) / Double(sample.unicodeScalars.count) > 0.1
    }

    private static func normalizeAccidentals(_ text: String) -> String {
        text
            .replacingOccurrences(of: "\u{266F}", with: "#")
            .replacingOccurrences(of: "\u{FF03}", with: "#")
            .replacingOccurrences(of: "\u{266D}", with: "b")
    }
}

private extension CGRect {
    /// `nonisolated` for the same reason the extractor itself is: the target defaults
    /// to MainActor isolation, and this is read from a detached task.
    nonisolated var isFinite: Bool {
        minX.isFinite && minY.isFinite && width.isFinite && height.isFinite
    }
}
