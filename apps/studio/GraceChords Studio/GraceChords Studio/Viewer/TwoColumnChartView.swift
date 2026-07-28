//
//  TwoColumnChartView.swift
//  GraceChords Studio
//
//  Two-column chart for wide windows. Port of
//  apps/mobile/src/components/TwoColumnChart.tsx and the partition math in
//  apps/mobile/src/lib/columnLayout.ts.
//
//  The rule is fill-first, NOT balanced: whole sections pack into column 1 until
//  the next one would overflow the viewport, then everything remaining flows to
//  column 2. Columns are top-aligned and intentionally unequal — a section is
//  atomic (the parser's boundary is the unit) and never split, because splitting a
//  chorus across columns is worse than an uneven page.
//
//  Heights have to be measured, not estimated: wrapping depends on width, font
//  scale and the chord symbols themselves. Sections are therefore rendered once
//  offscreen at COLUMN width (narrower → taller, so single-column heights cannot be
//  reused) and once at full width for the does-it-even-overflow test.
//

import SwiftUI

struct TwoColumnChartView: View {
    let doc: SongDoc
    var options: ChartRenderOptions = .default
    /// Visible height of the chart area. Double only engages when the song
    /// overflows this; a song that fits on one screen stays single-column.
    var viewportHeight: CGFloat = 0

    @State private var sectionHeights: [Int: CGFloat] = [:]
    @State private var singleColumnHeight: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    /// Identity of the inputs the measurements are valid for. When it changes the
    /// cached heights are dropped — mobile's MeasureInputs, as one value.
    @State private var measurementKey: MeasurementKey?

    /// Gap between stacked sections, matching ChordChartView's spacing.
    private static let sectionGap = GCSpacing.md
    private static let columnGap = GCSpacing.xl

    private struct MeasurementKey: Equatable {
        let width: CGFloat
        let fontScale: Double
        let showChords: Bool
        let showSections: Bool
        let sectionCount: Int
        /// Cheap stand-in for "the chord symbols changed": the rendered doc is
        /// already transposed and styled, so its own content covers steps,
        /// accidental and chord style in one value.
        let contentHash: Int
    }

    private var sections: [SongSection] {
        doc.sections.filter { !$0.lines.isEmpty }
    }

    private var columnWidth: CGFloat {
        max(0, (containerWidth - Self.columnGap) / 2)
    }

    private var currentKey: MeasurementKey {
        MeasurementKey(
            width: containerWidth,
            fontScale: options.fontScale,
            showChords: options.showChords,
            showSections: options.showSections,
            sectionCount: sections.count,
            contentHash: doc.hashValue
        )
    }

    /// Where column 2 starts, or nil to render single-column.
    private var columnTwoStart: Int? {
        guard measurementKey == currentKey, sectionHeights.count == sections.count else { return nil }
        let heights = (0..<sections.count).map { sectionHeights[$0] ?? 0 }
        return Self.partition(
            heights: heights,
            viewportHeight: viewportHeight,
            gap: Self.sectionGap,
            singleColumnHeight: singleColumnHeight
        )
    }

    var body: some View {
        content
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
                guard abs(width - containerWidth) > 0.5 else { return }
                containerWidth = width
            }
            .background(measurementLayer)
    }

    @ViewBuilder
    private var content: some View {
        if let start = columnTwoStart {
            HStack(alignment: .top, spacing: Self.columnGap) {
                column(sections[0..<start])
                column(sections[start..<sections.count])
            }
        } else {
            // Not measured yet, or everything fits: the ordinary single column.
            ChordChartView(doc: doc, options: options)
        }
    }

    private func column(_ slice: ArraySlice<SongSection>) -> some View {
        VStack(alignment: .leading, spacing: Self.sectionGap) {
            ForEach(Array(slice.enumerated()), id: \.offset) { _, section in
                ChartSectionView(section: section, options: options)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    /// Offscreen measurement. Zero-opacity and non-interactive rather than hidden,
    /// because a `hidden()` subtree is not laid out and would report no height.
    @ViewBuilder
    private var measurementLayer: some View {
        if containerWidth > 0 {
            VStack(spacing: 0) {
                // Per-section heights at column width.
                ForEach(Array(sections.enumerated()), id: \.offset) { index, section in
                    ChartSectionView(section: section, options: options)
                        .frame(width: columnWidth, alignment: .topLeading)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                            record(height: height, forSection: index)
                        }
                }
                // Total height at full width — the overflow test.
                ChordChartView(doc: doc, options: options)
                    .frame(width: containerWidth, alignment: .topLeading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        guard abs(height - singleColumnHeight) > 0.5 else { return }
                        singleColumnHeight = height
                    }
            }
            .opacity(0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func record(height: CGFloat, forSection index: Int) {
        // Inputs changed since the last pass: start a fresh set rather than mixing
        // heights measured under different conditions.
        if measurementKey != currentKey {
            measurementKey = currentKey
            sectionHeights = [index: height]
            return
        }
        guard abs((sectionHeights[index] ?? -1) - height) > 0.5 else { return }
        sectionHeights[index] = height
    }

    /// Greedy O(n) fill-first partition. Direct port of `partitionSections` in
    /// apps/mobile/src/lib/columnLayout.ts, kept pure so the rules are testable.
    ///
    /// Returns the index column 2 starts at, or nil for single-column.
    static func partition(
        heights: [CGFloat],
        viewportHeight: CGFloat,
        gap: CGFloat,
        singleColumnHeight: CGFloat
    ) -> Int? {
        let count = heights.count
        // Nothing to split, an unmeasurable viewport, or a song that already fits.
        guard count > 1, viewportHeight > 0 else { return nil }
        guard singleColumnHeight > viewportHeight else { return nil }

        var columnHeight: CGFloat = 0
        for index in 0..<count {
            let addition = index == 0 ? heights[index] : gap + heights[index]
            // An oversized first section still anchors column 1 — two columns delay
            // overflow, they do not eliminate it — so only break once column 1 has
            // at least one section.
            if index > 0, columnHeight + addition > viewportHeight {
                return index
            }
            columnHeight += addition
        }
        // Everything fit in one column even at column width.
        return nil
    }
}
