//
//  TransposeBar.swift
//  GraceChords Studio
//
//  Floating transpose pill: key-down / current key / key-up, with the capo hint
//  above it. Port of apps/mobile/src/components/TransposeBar.tsx — a dumb view;
//  the Viewer owns the transpose state.
//
//  One deliberate platform difference: mobile opens the key selector on a
//  long-press of the centre label, which is not a discoverable Mac gesture. Here a
//  plain click opens it, and the label carries a pointer cursor and help tag to
//  say so.
//

import SwiftUI

struct TransposeBar: View {
    let keyLabel: String
    var capoText: String?
    var onDown: () -> Void
    var onUp: () -> Void
    /// Opens the key selector. Optional so the bar still works with no picker wired.
    var onChooseKey: (() -> Void)?

    var body: some View {
        VStack(spacing: 6) {
            if let capoText = capoText {
                Text(capoText)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(GCColor.textAccent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(GCColor.accentSoft, in: Capsule())
            }
            pill
        }
    }

    private var pill: some View {
        HStack(spacing: 2) {
            stepButton(systemImage: "chevron.down", label: "Transpose down", action: onDown)

            Button {
                onChooseKey?()
            } label: {
                Text(keyLabel)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(GCColor.ink)
                    .frame(minWidth: 38)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(onChooseKey == nil)
            .pointerStyle(onChooseKey == nil ? .default : .link)
            .help("Choose key")
            .accessibilityLabel("Choose key")
            .accessibilityHint("Opens the key selector")

            stepButton(systemImage: "chevron.up", label: "Transpose up", action: onUp)
        }
        .padding(4)
        // A floating control over content is what vibrancy is for on macOS: the
        // chart tints it instead of a flat fill sitting on top of the page. It also
        // means the bar needs no border to read as a distinct surface.
        .background(.regularMaterial, in: Capsule())
        .overlay {
            // Hairline for definition where the material meets a light chart.
            Capsule().strokeBorder(GCColor.border.opacity(0.5), lineWidth: 0.5)
        }
        // Fixed black, NOT a theme token: `GCColor.ink` is a *foreground* color, so
        // in dark mode it resolves near-white and the "shadow" became a glow. A
        // shadow is a shadow in both appearances.
        .shadow(color: .black.opacity(0.18), radius: 6, x: 0, y: 2)
    }

    private func stepButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(GCColor.accent)
                .frame(width: 30, height: 26)
                .contentShape(Rectangle())
        }
        // `.accessoryBar` gives the hover highlight a Mac user expects from a
        // floating control, so the buttons need no fill of their own.
        .buttonStyle(.accessoryBar)
        .help(label)
        .accessibilityLabel(label)
    }
}
