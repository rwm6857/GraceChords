//
//  ViewOptionsView.swift
//  GraceChords Studio
//
//  The View-options panel: show chords, section labels, font size, chord style,
//  accidentals, columns, and the two screen preferences.
//
//  Same controls and order as apps/mobile's ViewOptionsSheet, but built as a macOS
//  settings panel rather than a port of the iOS sheet. `Form` + `.formStyle(.grouped)`
//  is what gives it the native look: labels in an aligned column with their controls
//  trailing, sentence-case `Section` headers instead of an uppercase overline, a real
//  `Stepper` for the font size, and system segmented pickers in place of the
//  hand-rolled toggles the first pass carried over from the iOS sheet.
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
        Form {
            Section {
                Toggle("Show chords", isOn: $model.showChords)
                Toggle("Section labels", isOn: $model.showSections)

                LabeledContent("Font size") {
                    HStack(spacing: GCSpacing.sm) {
                        Text(model.fontScalePercentLabel)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                        Stepper(
                            "Font size",
                            value: $model.fontScale,
                            in: SongViewerModel.fontScaleMin...SongViewerModel.fontScaleMax,
                            step: SongViewerModel.fontScaleStep
                        )
                        .labelsHidden()
                    }
                }

                Picker("Chord style", selection: chordStyleBinding) {
                    ForEach(ChordStyle.allCases, id: \.self) { style in
                        Text(style.label).tag(style)
                    }
                }
                .pickerStyle(.segmented)

                Picker("Accidentals", selection: accidentalBinding) {
                    ForEach(Accidental.allCases, id: \.self) { accidental in
                        Text(accidental.glyph)
                            .accessibilityLabel(accidental.accessibilityLabel)
                            .tag(accidental)
                    }
                }
                .pickerStyle(.segmented)

                if let columnMode = columnMode, let onColumnMode = onColumnMode {
                    Picker("Columns", selection: Binding(get: { columnMode }, set: onColumnMode)) {
                        ForEach(ColumnMode.allCases, id: \.self) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }

            Section("Screen") {
                Toggle("Hide controls when idle", isOn: $defaults.autoHideChrome)
                Toggle("Keep screen awake", isOn: $defaults.keepAwake)
            }
        }
        .formStyle(.grouped)
        .frame(width: 320)
        // A grouped Form wants to fill its container; in a popover it has to size to
        // its content instead.
        .fixedSize(horizontal: false, vertical: true)
    }

    /// The Viewer's chord style is session-local: changing it here must not write
    /// back to the app-wide default, which is Settings' to own.
    private var chordStyleBinding: Binding<ChordStyle> {
        Binding(get: { model.chordStyle }, set: { model.chordStyle = $0 })
    }

    /// Routed through `setAccidental` so choosing one latches it and the key stops
    /// reseeding the spelling.
    private var accidentalBinding: Binding<Accidental> {
        Binding(get: { model.accidental }, set: { model.setAccidental($0) })
    }
}
