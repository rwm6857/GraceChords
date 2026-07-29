//
//  ChordProToolbar.swift
//  GraceChords Studio
//
//  Quick insert for the ChordPro editor: diatonic chords for the song's key, section
//  wrappers, and the user's own macros.
//
//  The point is to write a song without typing directives. Sections are the worst of
//  it — `{start_of_verse: Verse 1}` … `{end_of_verse}` is 40 characters of punctuation
//  per section, and a song has six of them.
//
//  Every button's *effect* comes from `packages/core/src/chordpro/editing.ts` through
//  CoreBridge, so Studio inserts exactly what the web editor inserts. This file is the
//  buttons and the selection plumbing, nothing more. In particular the chord list is
//  core's `getDiatonicChords`, so "the seven chords in this key" is one definition
//  shared by both editors rather than a Swift guess at music theory.
//

import SwiftUI

struct ChordProToolbar: View {
    /// The song's key, which decides the chord buttons.
    let key: String
    /// nil when there is no selection to wrap — the section buttons still work, they
    /// just insert an empty block instead.
    let hasSelection: Bool
    let bridge: CoreBridge?

    var onInsert: (String) -> Void
    var onWrap: (SectionPreset) -> Void
    /// Text to offer when saving a macro — the current selection, or the whole body.
    var macroSource: () -> String

    @ObservedObject private var macros: MacroStore = .shared

    @State private var variant: String = ""
    @State private var showsMacroSheet = false
    @State private var macroName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: GCSpacing.xs) {
            chordRow
            sectionRow
        }
        .padding(.horizontal, GCSpacing.md)
        .padding(.vertical, GCSpacing.sm)
        .background(GCColor.surface)
        .overlay(alignment: .bottom) { Divider() }
        .sheet(isPresented: $showsMacroSheet) { macroSheet }
    }

    // MARK: - Chords

    private var diatonic: [DiatonicChord] {
        guard let bridge = bridge, !key.isEmpty else { return [] }
        return (try? bridge.diatonicChords(for: key)) ?? [] ?? []
    }

    private var variants: [String] {
        guard let bridge = bridge else { return [] }
        return (try? bridge.chordVariants()) ?? []
    }

    @ViewBuilder
    private var chordRow: some View {
        let chords = diatonic
        if chords.isEmpty {
            // No key, or one core does not recognise. Saying so beats showing the
            // wrong seven chords.
            Text(key.isEmpty ? "Choose a key to get its chords" : "No chords for “\(key)”")
                .gcTextStyle(.overline)
                .foregroundStyle(GCColor.muted)
                .frame(height: 22)
        } else {
            // FlowLayout, not HStack: eight section buttons plus a menu do not fit one
            // row in a split pane, and an HStack answers that by truncating every
            // label to "Cho…" / "Brid…" / "Pre-…". Wrapping to a second row keeps them
            // readable, which for a button whose whole job is to be recognised at a
            // glance is the difference between useful and decorative.
            FlowLayout(horizontalSpacing: GCSpacing.xs, verticalSpacing: GCSpacing.xs) {
                ForEach(chords) { chord in
                    Button {
                        insertChord(chord)
                    } label: {
                        VStack(spacing: 0) {
                            Text(chord.display + variant)
                                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            // The numeral, so the bar teaches the key as well as
                            // saving keystrokes — and so a player thinking "the four
                            // chord" can find it without translating.
                            Text(chord.degree)
                                .font(.system(size: 8, weight: .regular))
                                .foregroundStyle(GCColor.muted)
                        }
                        .frame(minWidth: 40)
                        .padding(.vertical, 3)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.bordered)
                    .help("Insert [\(chord.symbol)\(variant)]")
                }

                // The suffix is a mode rather than a separate button per variant:
                // seven chords times five suffixes is 35 buttons, which is a worse
                // problem than the one being solved.
                Picker("", selection: $variant) {
                    Text("—").tag("")
                    ForEach(variants, id: \.self) { Text($0).tag($0) }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .frame(width: 76)
                .help("Suffix added to the next chord you insert")
            }
        }
    }

    private func insertChord(_ chord: DiatonicChord) {
        let symbol = chord.symbol + variant
        // Through core, so the token shape ("[G]") is defined in exactly one place.
        let token = (try? bridge?.chordToken(symbol)) ?? "[\(symbol)]"
        onInsert(token ?? "[\(symbol)]")
    }

    // MARK: - Sections and macros

    private var presets: [SectionPreset] {
        guard let bridge = bridge else { return [] }
        return (try? bridge.sectionPresets()) ?? []
    }

    private var sectionRow: some View {
        FlowLayout(horizontalSpacing: GCSpacing.xs, verticalSpacing: GCSpacing.xs) {
            ForEach(presets) { preset in
                Button {
                    onWrap(preset)
                } label: {
                    Text(preset.label)
                        .font(.system(size: 11))
                        .padding(.vertical, 2)
                }
                .buttonStyle(.bordered)
                .help(sectionHelp(preset))
                // Never abbreviate a section name — see the FlowLayout note above.
                .fixedSize()
            }
            macroMenu
        }
    }

    /// Names the two behaviours explicitly, because which one you get depends on
    /// whether anything is selected — and silently doing the other one is confusing.
    private func sectionHelp(_ preset: SectionPreset) -> String {
        let directive = "{start_of_\(preset.directive): \(preset.sectionLabel)}"
        return hasSelection
            ? "Wrap the selected lines in \(directive)"
            : "Insert an empty \(directive) block"
    }

    private var macroMenu: some View {
        Menu {
            if macros.macros.isEmpty {
                Text("No macros yet")
            } else {
                ForEach(macros.macros) { macro in
                    Button {
                        onInsert(macro.body)
                    } label: {
                        Text(macro.name)
                    }
                    .help(macro.firstLine)
                }
                Divider()
                Menu("Delete Macro") {
                    ForEach(macros.macros) { macro in
                        Button(macro.name, role: .destructive) { macros.remove(macro) }
                    }
                }
            }
            Divider()
            Button(hasSelection ? "Save Selection as Macro…" : "Save Song as Macro…") {
                macroName = ""
                showsMacroSheet = true
            }
            .disabled(macroSource().trimmed.isEmpty)
        } label: {
            Label("Macros", systemImage: "text.append")
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("Insert or save a reusable snippet")
    }

    private var macroSheet: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            Text("Save as macro").gcTextStyle(.rowTitle).foregroundStyle(GCColor.ink)
            TextField("Name, e.g. “House intro”", text: $macroName)
                .textFieldStyle(.roundedBorder)
                .onSubmit(saveMacro)

            // Shows what is actually being saved — a macro saved from the wrong
            // selection is otherwise only discovered when it is inserted.
            ScrollView {
                Text(macroSource())
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(GCColor.sec)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(height: 120)
            .padding(GCSpacing.sm)
            .background(GCColor.bg, in: RoundedRectangle(cornerRadius: GCRadius.sm))

            HStack {
                Spacer()
                Button("Cancel") { showsMacroSheet = false }
                Button("Save", action: saveMacro)
                    .keyboardShortcut(.defaultAction)
                    .disabled(macroName.trimmed.isEmpty)
            }
        }
        .padding(GCSpacing.lg)
        .frame(width: 380)
    }

    private func saveMacro() {
        guard !macroName.trimmed.isEmpty else { return }
        macros.add(name: macroName, body: macroSource())
        showsMacroSheet = false
    }
}
