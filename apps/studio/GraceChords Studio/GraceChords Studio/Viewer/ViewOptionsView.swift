//
//  ViewOptionsView.swift
//  GraceChords Studio
//
//  The View-options panel: show chords, section labels, font size, chord style,
//  accidentals, columns, and the two screen preferences.
//
//  Port of apps/mobile/src/components/ViewOptionsSheet.tsx, control for control and
//  in the same order. Presented as a popover from the toolbar button rather than a
//  bottom sheet — the Mac form of the same "anchored to what opened it"
//  relationship, per the platform-HIG-wins rule Theme.swift documents.
//
//  Which options persist is mobile's split, not a new one: chords/sections/font
//  size/style/accidentals are session-only, columns persist per song, and the two
//  screen toggles persist app-wide.
//

import SwiftUI

struct ViewOptionsView: View {
    @ObservedObject var model: SongViewerModel
    @ObservedObject var defaults: StudioDefaults
    /// Non-nil only when the window is wide enough for two columns to be readable,
    /// mirroring how mobile wires this at tablet widths only.
    var columnMode: ColumnMode?
    var onColumnMode: ((ColumnMode) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("View options")
                .gcTextStyle(.sectionHeader)
                .foregroundStyle(GCColor.ink)
                .padding(.bottom, GCSpacing.md)

            Toggle("Show chords", isOn: $model.showChords)
            Toggle("Section labels", isOn: $model.showSections)

            row("Font size") {
                HStack(spacing: 2) {
                    stepper(systemImage: "textformat.size.smaller",
                            label: "Smaller font",
                            disabled: model.isAtMinimumFontScale) {
                        model.stepFontScale(by: -1)
                    }
                    Text(model.fontScalePercentLabel)
                        .font(.system(size: 12, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(GCColor.sec)
                        .frame(minWidth: 40)
                    stepper(systemImage: "textformat.size.larger",
                            label: "Larger font",
                            disabled: model.isAtMaximumFontScale) {
                        model.stepFontScale(by: 1)
                    }
                }
            }

            row("Chord style") {
                Picker("", selection: chordStyleBinding) {
                    ForEach(ChordStyle.allCases, id: \.self) { style in
                        Text(style.label).tag(style)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
            }

            row("Accidentals") {
                AccidentalToggle(value: model.accidental) { model.setAccidental($0) }
            }

            if let columnMode = columnMode, let onColumnMode = onColumnMode {
                row("Columns") {
                    Picker("", selection: Binding(get: { columnMode }, set: onColumnMode)) {
                        ForEach(ColumnMode.allCases, id: \.self) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .fixedSize()
                }
            }

            Divider().padding(.vertical, GCSpacing.md)

            Text("SCREEN")
                .gcTextStyle(.overline)
                .foregroundStyle(GCColor.muted)
                .padding(.bottom, GCSpacing.sm)

            Toggle("Hide controls when idle", isOn: $defaults.autoHideChrome)
            Toggle("Keep screen awake", isOn: $defaults.keepAwake)
        }
        .toggleStyle(.switch)
        .gcTextStyle(.body)
        .padding(GCSpacing.lg)
        .frame(width: 320)
    }

    /// The Viewer's chord style is session-local: changing it here must not write
    /// back to the app-wide default, which is Settings' to own.
    private var chordStyleBinding: Binding<ChordStyle> {
        Binding(get: { model.chordStyle }, set: { model.chordStyle = $0 })
    }

    @ViewBuilder
    private func row<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(title)
            Spacer(minLength: GCSpacing.md)
            content()
        }
        .padding(.vertical, GCSpacing.xs)
    }

    private func stepper(
        systemImage: String,
        label: String,
        disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 28, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.bordered)
        .disabled(disabled)
        .help(label)
        .accessibilityLabel(label)
    }
}
