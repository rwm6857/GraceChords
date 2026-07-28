//
//  LintWarningsView.swift
//  GraceChords Studio
//
//  The advisory strip under the preview.
//
//  Presented as warnings, never as errors, because that is all core produces: every
//  code from packages/core/src/chordpro/lint.ts is prefixed `warn:` and the module
//  has no severity field. Nothing here blocks a save — a song with a suspicious
//  chord symbol is still a song, and a linter that stopped the user from writing
//  down what the band actually plays would be worse than no linter.
//
//  A body the PARSER rejects is a different failure and is shown in the preview
//  pane itself, not here.
//

import SwiftUI

struct LintWarningsView: View {
    let warnings: [LintWarning]
    @Binding var isExpanded: Bool

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            header
            if isExpanded, !warnings.isEmpty {
                Divider()
                list
            }
        }
        .background(GCColor.surface)
    }

    private var header: some View {
        Button {
            isExpanded.toggle()
        } label: {
            HStack(spacing: GCSpacing.sm) {
                Image(systemName: warnings.isEmpty ? "checkmark.circle" : "exclamationmark.triangle")
                    .foregroundStyle(warnings.isEmpty ? GCColor.success : GCColor.star)
                Text(summary)
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.sec)
                Spacer()
                if !warnings.isEmpty {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.up")
                        .foregroundStyle(GCColor.muted)
                        .font(.system(size: 9, weight: .semibold))
                }
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(warnings.isEmpty)
        .help(warnings.isEmpty ? "No ChordPro warnings" : "Show or hide ChordPro warnings")
    }

    private var summary: String {
        if warnings.isEmpty { return "No ChordPro warnings" }
        let noun = warnings.count == 1 ? "warning" : "warnings"
        return "\(warnings.count) ChordPro \(noun) — these do not prevent saving"
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(warnings) { warning in
                    HStack(alignment: .firstTextBaseline, spacing: GCSpacing.sm) {
                        Text(warning.shortLabel)
                            .gcTextStyle(.overline)
                            .foregroundStyle(GCColor.textAccent)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(GCColor.accentSoft, in: RoundedRectangle(cornerRadius: 4))
                            .frame(width: 150, alignment: .leading)
                        Text(warning.message)
                            .gcTextStyle(.rowMeta)
                            .foregroundStyle(GCColor.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let location = warning.locationText {
                            Text(location)
                                .gcTextStyle(.overline)
                                .foregroundStyle(GCColor.muted)
                        }
                    }
                    .padding(.horizontal, GCSpacing.md)
                    .padding(.vertical, GCSpacing.xs)
                    Divider().opacity(0.4)
                }
            }
            .padding(.vertical, GCSpacing.xs)
        }
        // Tall enough for a handful of rows, capped so the warnings never crowd out
        // the preview they annotate.
        .frame(maxHeight: 150)
    }
}
