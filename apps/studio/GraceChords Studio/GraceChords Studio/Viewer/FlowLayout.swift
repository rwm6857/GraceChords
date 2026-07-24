//
//  FlowLayout.swift
//  GraceChords Studio
//
//  Left-to-right wrapping layout — the SwiftUI equivalent of the React Native
//  `flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end'` row that
//  apps/mobile's ChordChart uses for chord-over-word cells. Children keep their
//  natural size and are bottom-aligned within each row so lyric baselines line up
//  whether or not a cell has a chord above it.
//

import SwiftUI

struct FlowLayout: Layout {
    var horizontalSpacing: CGFloat = 6
    var verticalSpacing: CGFloat = 2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let rows = arrange(maxWidth: maxWidth, subviews: subviews)

        let width = rows.map(\.width).max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + verticalSpacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: maxWidth.isFinite ? min(width, maxWidth) : width, height: height)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Void
    ) {
        let rows = arrange(maxWidth: bounds.width, subviews: subviews)
        var y = bounds.minY

        for row in rows {
            var x = bounds.minX
            for element in row.elements {
                let size = element.size
                // Bottom-aligned: taller neighbours (a cell with a chord) push
                // shorter ones down so the lyrics share a baseline.
                subviews[element.index].place(
                    at: CGPoint(x: x, y: y + row.height - size.height),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(size)
                )
                x += size.width + horizontalSpacing
            }
            y += row.height + verticalSpacing
        }
    }

    private struct Element {
        let index: Int
        let size: CGSize
    }

    private struct Row {
        var elements: [Element] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()

        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let projected = current.elements.isEmpty ? size.width : current.width + horizontalSpacing + size.width

            if !current.elements.isEmpty && projected > maxWidth {
                rows.append(current)
                current = Row()
                current.elements = [Element(index: index, size: size)]
                current.width = size.width
                current.height = size.height
            } else {
                current.elements.append(Element(index: index, size: size))
                current.width = projected
                current.height = max(current.height, size.height)
            }
        }

        if !current.elements.isEmpty { rows.append(current) }
        return rows
    }
}
