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
        VStack(spacing: GCSpacing.sm) {
            if let capoText = capoText {
                Text(capoText)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(GCColor.textAccent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(GCColor.accentSoft, in: Capsule())
            }
            pill
        }
    }

    private var pill: some View {
        HStack(spacing: 6) {
            stepButton(systemImage: "chevron.down", label: "Transpose down", action: onDown)

            Button {
                onChooseKey?()
            } label: {
                Text(keyLabel)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(GCColor.ink)
                    .frame(minWidth: 48)
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
        .padding(.vertical, 6)
        .padding(.horizontal, 8)
        .background(GCColor.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(GCColor.border, lineWidth: 1)
        }
        .shadow(color: GCColor.ink.opacity(0.18), radius: 14, x: 0, y: 6)
    }

    private func stepButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(GCColor.accent)
                .frame(width: 46, height: 44)
                .background(GCColor.surfaceAlt, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(label)
        .accessibilityLabel(label)
    }
}
