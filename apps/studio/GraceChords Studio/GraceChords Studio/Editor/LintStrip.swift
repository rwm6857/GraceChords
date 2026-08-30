//
//  LintStrip.swift
//  GraceChords Studio
//
//  The editor's warnings footer.
//
//  This existed once and was removed as visual clutter, for a good reason: with
//  `missing_title` and `missing_key` firing on every one of the catalog's songs, it
//  was a panel that said something wrong twice about every song, and the codes that
//  matter — `section_mismatch`, `unknown_chord` — were buried under them. It comes
//  back with two changes that answer that.
//
//  **It is not there when there is nothing to say.** `SongEditorModel.applicable`
//  drops the two form-answered codes, and a clean song renders no strip at all rather
//  than an empty one. A panel that says "no warnings" on every song earns no space;
//  one that appears exactly when something is wrong is worth looking at.
//
//  **It is collapsed by default.** The summary line is one row high and names the
//  count; the list is a click away. Warnings are advisory — every code core emits is
//  prefixed `warn:` and none of them block saving — so they get the space an advisory
//  deserves, not the space an error would.
//
//  Rows that can be navigated to are buttons; rows that cannot are text. See
//  Editor/LintLocator.swift for which is which and why some warnings cannot honestly
//  be turned into a caret position.
//

import SwiftUI

struct LintStrip: View {
    let warnings: [LintWarning]
    /// Whether this warning can be turned into a caret position at all.
    let canJump: (LintWarning) -> Bool
    let onJump: (LintWarning) -> Void

    @State private var isExpanded = false

    var body: some View {
        if !warnings.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Divider()
                summary
                if isExpanded {
                    Divider()
                    // Capped rather than unbounded: the strip is a footer on the
                    // editor, and a body with twenty warnings must not push the text
                    // it is complaining about off the screen.
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(warnings) { warning in
                                row(warning)
                            }
                        }
                    }
                    .frame(maxHeight: 132)
                }
            }
            .background(GCColor.surfaceAlt)
        }
    }

    private var summary: some View {
        Button {
            isExpanded.toggle()
        } label: {
            HStack(spacing: GCSpacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(GCColor.star)
                Text(warnings.count == 1 ? "1 warning" : "\(warnings.count) warnings")
                    .gcTextStyle(.overline)
                    .foregroundStyle(GCColor.sec)
                Spacer()
                Image(systemName: "chevron.up")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(GCColor.muted)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isExpanded ? "Hide warnings" : "Show warnings")
    }

    @ViewBuilder
    private func row(_ warning: LintWarning) -> some View {
        let jumpable = canJump(warning)
        Button {
            onJump(warning)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: GCSpacing.sm) {
                Text(warning.shortLabel)
                    .gcTextStyle(.overline)
                    .foregroundStyle(GCColor.muted)
                    .frame(width: 108, alignment: .leading)
                Text(warning.message)
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: GCSpacing.sm)
                if let location = warning.locationText {
                    Text(location)
                        .gcTextStyle(.overline)
                        .foregroundStyle(jumpable ? GCColor.textAccent : GCColor.muted)
                }
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Not merely disabled-looking: a row whose location cannot be resolved is not
        // a control at all, so it does not take a click that would do nothing.
        .disabled(!jumpable)
        .help(jumpable ? "Go to this line" : "This warning has no line to go to")
    }
}
