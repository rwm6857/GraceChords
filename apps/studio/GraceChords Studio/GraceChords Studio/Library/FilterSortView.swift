//
//  FilterSortView.swift
//  GraceChords Studio
//
//  Filter & sort for the library: a sort list where tapping the active row flips
//  its direction, plus a multi-select tag filter.
//
//  Port of apps/mobile/src/components/FilterSortSheet.tsx, presented as a popover
//  from the toolbar button rather than a bottom sheet.
//

import SwiftUI

struct FilterSortView: View {
    @ObservedObject var model: LibraryViewModel
    var onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            HStack {
                Text("Filter & sort")
                    .gcTextStyle(.sectionHeader)
                    .foregroundStyle(GCColor.ink)
                Spacer()
                if model.isFilterActive {
                    Button("Reset") { model.clearFilters() }
                        .buttonStyle(.plain)
                        .foregroundStyle(GCColor.accent)
                        .gcTextStyle(.rowMeta)
                }
            }

            Text("SORT BY")
                .gcTextStyle(.overline)
                .foregroundStyle(GCColor.muted)

            VStack(spacing: 0) {
                ForEach(SortKey.allCases) { key in
                    sortRow(key)
                }
            }

            if !model.availableTags.isEmpty {
                Divider()
                Text("FILTER BY TAG")
                    .gcTextStyle(.overline)
                    .foregroundStyle(GCColor.muted)
                // Wraps like mobile's chip cloud; FlowLayout is already the app's
                // wrapping row.
                FlowLayout(horizontalSpacing: GCSpacing.sm, verticalSpacing: GCSpacing.sm) {
                    ForEach(model.availableTags, id: \.self) { tag in
                        tagChip(tag)
                    }
                }
            }

            Divider()
            Button {
                onClose()
            } label: {
                Text(model.visibleCount == 1 ? "Show 1 song" : "Show \(model.visibleCount) songs")
                    .frame(maxWidth: .infinity)
            }
            .keyboardShortcut(.defaultAction)
        }
        .gcTextStyle(.body)
        .padding(GCSpacing.lg)
        .frame(width: 320)
    }

    /// Tapping the active sort flips direction; the arrow shows which way.
    private func sortRow(_ key: SortKey) -> some View {
        let selected = model.sortKey == key
        return Button {
            model.selectSort(key)
        } label: {
            HStack {
                Text(key.label)
                    .foregroundStyle(selected ? GCColor.accent : GCColor.ink)
                Spacer()
                if selected {
                    Image(systemName: model.sortDirection.systemImage)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(GCColor.accent)
                }
            }
            .padding(.vertical, GCSpacing.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .help(selected ? "Reverse the sort direction" : "Sort by \(key.label)")
    }

    private func tagChip(_ tag: String) -> some View {
        let selected = model.selectedTags.contains(tag)
        return Button {
            model.toggleTag(tag)
        } label: {
            Text(tag)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(selected ? GCColor.onAccent : GCColor.sec)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    selected ? GCColor.accent : GCColor.surfaceAlt,
                    in: Capsule()
                )
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}
