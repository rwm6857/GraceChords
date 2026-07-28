//
//  KeyPickerView.swift
//  GraceChords Studio
//
//  "Play this song in…" — a 4-column grid of the twelve keys with a ♯/♭ toggle that
//  relabels the grid, plus a reset back to the song's own key.
//
//  Port of apps/mobile/src/components/setlist/KeyPickerSheet.tsx. Presented as a
//  popover from the transpose bar rather than a bottom sheet, which is the Mac
//  equivalent of the same anchored-to-its-trigger relationship.
//

import SwiftUI

struct KeyPickerView: View {
    let songTitle: String
    /// The key currently displayed, for the selected state.
    let currentKey: String?
    /// The song's own key, offered as the reset target.
    let nativeKey: String?
    /// Whether a transpose is currently applied — gates the reset row.
    let hasOverride: Bool
    let accidental: Accidental
    var onAccidental: (Accidental) -> Void
    /// nil resets to the song's own key.
    var onPick: (String?) -> Void
    var onClose: () -> Void

    /// Mirrors `KEYS` in packages/core/src/chordpro/index.js — the chromatic scale
    /// in sharp spelling. The flat row is mobile's FLAT_KEYS, aligned by index.
    private static let sharpKeys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private static let flatKeys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

    private var labels: [String] { accidental == .flat ? Self.flatKeys : Self.sharpKeys }

    var body: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            HStack(alignment: .firstTextBaseline) {
                Text("Play \(songTitle) in…")
                    .gcTextStyle(.rowTitle)
                    .foregroundStyle(GCColor.ink)
                    .lineLimit(2)
                Spacer(minLength: GCSpacing.sm)
                Picker("Accidentals", selection: Binding(get: { accidental }, set: onAccidental)) {
                    ForEach(Accidental.allCases, id: \.self) { candidate in
                        Text(candidate.glyph)
                            .accessibilityLabel(candidate.accessibilityLabel)
                            .tag(candidate)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: GCSpacing.sm), count: 4),
                      spacing: GCSpacing.sm) {
                ForEach(Array(Self.sharpKeys.enumerated()), id: \.offset) { index, sharpKey in
                    keyCell(sharpKey: sharpKey, label: labels[index])
                }
            }

            if hasOverride, let nativeKey = nativeKey, !nativeKey.isEmpty {
                Divider()
                Button("Reset to \(nativeKey)") {
                    onPick(nil)
                    onClose()
                }
                .accessibilityLabel("Reset to the original key")
            }
        }
        .padding(GCSpacing.lg)
        .frame(width: 300)
    }

    /// Selection compares against the *sharp* spelling so a flat-labelled cell
    /// still reads as selected — the two spellings are the same pitch.
    private func keyCell(sharpKey: String, label: String) -> some View {
        let selected = currentKey.map { isSameKey($0, sharpKey) } ?? false
        // `.bordered` / `.borderedProminent` rather than a hand-drawn fill: these
        // pick up the system's pressed and hover states for free, which a custom
        // background does not.
        return Button {
            onPick(label)
            onClose()
        } label: {
            Text(label)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .tint(selected ? GCColor.accent : nil)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    /// Enharmonic comparison without a bridge call: normalise the flat spellings
    /// this grid can produce to their sharp equivalents, then compare roots.
    private func isSameKey(_ lhs: String, _ rhs: String) -> Bool {
        normalizedRoot(lhs) == normalizedRoot(rhs)
    }

    private func normalizedRoot(_ key: String) -> String {
        let flatToSharp = ["Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"]
        // Root is the letter plus an optional accidental; the rest is quality.
        var root = String(key.prefix(1)).uppercased()
        let remainder = key.dropFirst()
        if let accidental = remainder.first, accidental == "#" || accidental == "b" {
            root += String(accidental)
        }
        return flatToSharp[root] ?? root
    }
}
