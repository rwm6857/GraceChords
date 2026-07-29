//
//  TagField.swift
//  GraceChords Studio
//
//  Tag entry with a type-ahead over the tags already in the catalog.
//
//  The point is spelling discipline, not convenience. `songs.tags` is matched
//  case-sensitively by the library filter and by the web app's tag pages, so a tag
//  typed slightly differently becomes a second, near-empty category. The catalog
//  already shows what that costs: "Contemporrary" alongside "Contemporary", a tag
//  that is just ".", and "lion of judah" in a set otherwise written in Title Case.
//  Suggesting existing tags — most-used first, and matched as you type — makes
//  reusing the right one easier than inventing a new one.
//
//  Keyboard-first, because that is how tags get entered in practice: ↑/↓ or Tab
//  moves through the suggestions, Return takes the highlighted one (or the raw text
//  when nothing is highlighted), Escape closes the list.
//

import SwiftUI

struct TagField: View {
    @Binding var tags: [String]
    /// Catalog tags, most-used first. Order is the suggestion order when the field
    /// is empty, so the common tags are the ones within reach.
    let knownTags: [String]

    @State private var input = ""
    @State private var highlighted: Int?
    @FocusState private var isFocused: Bool

    private static let maximumSuggestions = 6

    var body: some View {
        VStack(alignment: .leading, spacing: GCSpacing.sm) {
            TextField("Add tags, comma-separated", text: $input)
                .textFieldStyle(.roundedBorder)
                .focused($isFocused)
                .onSubmit(commitInput)
                .onChange(of: input) { _, _ in
                    // Any edit invalidates the highlight — otherwise Return could
                    // take a suggestion that is no longer under the cursor.
                    highlighted = nil
                }
                .onKeyPress(.downArrow) { move(by: 1) }
                .onKeyPress(.upArrow) { move(by: -1) }
                .onKeyPress(.tab) { move(by: 1) }
                .onKeyPress(.escape) {
                    guard highlighted != nil || !input.isEmpty else { return .ignored }
                    highlighted = nil
                    input = ""
                    return .handled
                }
                .popover(isPresented: showsSuggestions, attachmentAnchor: .rect(.bounds), arrowEdge: .bottom) {
                    suggestionList
                }

            if !tags.isEmpty { chips }
        }
    }

    // MARK: - Suggestions

    /// Ranked: exact prefix first, then substring, then the remaining catalog tags —
    /// each group keeping the most-used-first order it arrived in. Tags already on
    /// the song are excluded, since adding one twice is a no-op.
    private var suggestions: [String] {
        let query = input.trimmed.lowercased()
        let available = knownTags.filter { candidate in
            !tags.contains { $0.caseInsensitiveCompare(candidate) == .orderedSame }
        }
        guard !query.isEmpty else { return Array(available.prefix(Self.maximumSuggestions)) }

        // A comma means the user is partway through a list; rank on the last piece.
        let last = query.split(separator: ",").last.map { String($0).trimmed } ?? query
        guard !last.isEmpty else { return Array(available.prefix(Self.maximumSuggestions)) }

        let prefix = available.filter { $0.lowercased().hasPrefix(last) }
        let contains = available.filter { !$0.lowercased().hasPrefix(last) && $0.lowercased().contains(last) }
        return Array((prefix + contains).prefix(Self.maximumSuggestions))
    }

    /// A popover rather than an overlay: the form lives inside a `ScrollView`, and an
    /// overlaid list would be clipped by it at the bottom row — which is exactly
    /// where the tags field sits.
    private var showsSuggestions: Binding<Bool> {
        Binding(
            get: { isFocused && !suggestions.isEmpty },
            set: { shown in if !shown { highlighted = nil } }
        )
    }

    private var suggestionList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(suggestions.enumerated()), id: \.element) { index, tag in
                Button {
                    take(tag)
                } label: {
                    HStack {
                        Text(tag).gcTextStyle(.rowMeta)
                        Spacer(minLength: GCSpacing.md)
                    }
                    .padding(.horizontal, GCSpacing.sm)
                    .padding(.vertical, 5)
                    .background(
                        index == highlighted ? GCColor.accent : Color.clear,
                        in: RoundedRectangle(cornerRadius: 5)
                    )
                    .foregroundStyle(index == highlighted ? GCColor.onAccent : GCColor.ink)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(GCSpacing.xs)
        .frame(minWidth: 180)
    }

    // MARK: - Keyboard

    private func move(by offset: Int) -> KeyPress.Result {
        let options = suggestions
        guard !options.isEmpty else { return .ignored }
        let next = (highlighted ?? -1) + offset
        // Clamped rather than wrapped: wrapping past the end silently jumps to the
        // opposite end, which reads as the list having scrolled.
        highlighted = min(max(next, 0), options.count - 1)
        return .handled
    }

    /// Return: take the highlighted suggestion if there is one, otherwise whatever
    /// was typed — including a comma-separated list.
    private func commitInput() {
        if let highlighted = highlighted, suggestions.indices.contains(highlighted) {
            take(suggestions[highlighted])
            return
        }
        guard !input.trimmed.isEmpty else { return }
        var form = tags
        for piece in input.split(separator: ",") {
            let typed = String(piece).trimmed
            guard !typed.isEmpty else { continue }
            let snapped = knownTags.first { $0.caseInsensitiveCompare(typed) == .orderedSame } ?? typed
            if !form.contains(where: { $0.caseInsensitiveCompare(snapped) == .orderedSame }) {
                form.append(snapped)
            }
        }
        tags = form
        input = ""
        highlighted = nil
    }

    private func take(_ tag: String) {
        if !tags.contains(where: { $0.caseInsensitiveCompare(tag) == .orderedSame }) {
            tags.append(tag)
        }
        input = ""
        highlighted = nil
    }

    // MARK: - Chips

    private var chips: some View {
        FlowLayout(horizontalSpacing: GCSpacing.xs, verticalSpacing: GCSpacing.xs) {
            ForEach(tags, id: \.self) { tag in
                HStack(spacing: 4) {
                    Text(tag).gcTextStyle(.rowMeta)
                    Button {
                        tags.removeAll { $0 == tag }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(tag)")
                }
                .padding(.leading, GCSpacing.sm)
                .padding(.trailing, 6)
                .padding(.vertical, 3)
                .background(GCColor.accentSoft, in: Capsule())
                .foregroundStyle(GCColor.textAccent)
            }
        }
    }
}
