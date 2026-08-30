//
//  SongEditorView.swift
//  GraceChords Studio
//
//  One song being written: metadata form, plain-text ChordPro editor, live preview.
//
//  The preview is `ChordChartView`, the SAME view the Song Viewer draws, fed the
//  same `SongDoc` from the same bridged parser. There is deliberately no
//  editor-specific renderer: a preview that could disagree with the Viewer would be
//  worse than no preview.
//
//  The editor itself is `ChordProTextView` — an NSTextView behind an
//  NSViewRepresentable, which is what it takes to colour [chords] and {directives},
//  since SwiftUI's `TextEditor` cannot style ranges. That file owns the plumbing and
//  `ChordProHighlighter` owns what the colours mean; neither is this view's business
//  beyond handing them the body and the caret.
//
//  Toolbar verbs are icons with a transient outcome badge rather than words plus a
//  status chip. Save and Publish each report how they went on themselves — green
//  check or red cross, cleared by the next edit — which is the thing the user
//  actually wants to know after pressing them, and it costs no permanent chrome.
//

import SwiftUI

struct SongEditorView: View {
    @ObservedObject var model: SongEditorModel
    /// Catalog tags, most-used first, for the tag field's type-ahead.
    var knownTags: [String] = []
    /// Start a new blank song. Routed up because only the Manage section knows how to
    /// replace the open editor (and how to guard unsaved changes first).
    var onNewSong: () -> Void

    @State private var showsDeleteConfirmation = false
    @State private var showsDetails = true
    /// In a pane too narrow to split, the preview replaces the editor rather than
    /// sitting beside it. Separate from `model.showsPreview` because the sensible
    /// default differs: side by side the preview should be up, but a narrow pane must
    /// open on the editor — you open an editor to type in it.
    @State private var narrowShowsPreview = false

    /// Minimum width for a side-by-side split, and the two panes' minimums that add
    /// up to it. Kept as one set of numbers so the threshold cannot drift above what
    /// the panes actually need and strand the preview.
    ///
    /// Measured on the DETAIL COLUMN, not the window: with the sidebar taking
    /// 240–300 this pane is that much narrower than the window around it.
    private static let writingMinimumWidth: CGFloat = 360
    private static let previewMinimumWidth: CGFloat = 320
    private static let splitMinimumWidth: CGFloat = writingMinimumWidth + previewMinimumWidth

    /// The form stops growing here. Text fields stretched across a 1400pt window put
    /// the title's first character and its last a screen apart, which is harder to
    /// read than a column, not easier — so past this width the form stays put and the
    /// space goes to the ChordPro body and the preview.
    private static let formMaximumWidth: CGFloat = 680

    @State private var availableWidth: CGFloat = 0

    private enum PaneLayout { case editorOnly, previewOnly, split }

    private var isWide: Bool { availableWidth >= Self.splitMinimumWidth }

    private var paneLayout: PaneLayout {
        if isWide { return model.showsPreview ? .split : .editorOnly }
        return narrowShowsPreview ? .previewOnly : .editorOnly
    }

    private var isPreviewVisible: Bool { paneLayout != .editorOnly }

    var body: some View {
        content
            .navigationTitle(model.windowTitle)
            .navigationSubtitle(model.isDirty ? "Edited" : "")
            .toolbar { toolbarItems }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
                guard abs(width - availableWidth) > 0.5 else { return }
                availableWidth = width
            }
            .task { await model.load() }
            .alert("Delete “\(model.windowTitle)”?", isPresented: $showsDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete Song", role: .destructive) {
                    Task { await model.delete() }
                }
            } message: {
                Text(model.deleteConfirmationMessage)
            }
            .sheet(isPresented: $model.showsImportSheet) {
                PDFImportSheet(model: model)
            }
            // The import has no review step, so this is the one place it asks: the
            // body already has text and is about to be replaced wholesale. An empty
            // editor imports with no prompt.
            .confirmationDialog(
                "Replace the song text with the imported PDF?",
                isPresented: Binding(
                    get: { model.pendingImport != nil },
                    set: { if !$0 { model.discardPendingImport() } }
                ),
                titleVisibility: .visible
            ) {
                Button("Replace", role: .destructive) { model.confirmPendingImport() }
                Button("Cancel", role: .cancel) { model.discardPendingImport() }
            } message: {
                Text("What you have typed will be replaced. This is not saved to the server either way.")
            }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let errorText = model.errorText, model.songID == nil, model.form.title.isEmpty {
            // A load that failed outright — distinct from a save error, which is
            // shown as a banner over a working editor.
            VStack(alignment: .leading, spacing: GCSpacing.sm) {
                Text(errorText).gcTextStyle(.body).foregroundStyle(GCColor.sec)
            }
            .padding(GCSpacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            editor
        }
    }

    @ViewBuilder
    private var editor: some View {
        VStack(spacing: 0) {
            statusBanner
            switch paneLayout {
            case .split:
                // Two hierarchies rather than one with a conditional inside, so
                // toggling the preview does not rebuild the HSplitView and reset the
                // divider position the user dragged.
                HSplitView {
                    writingPane
                    previewPane
                }
            case .editorOnly:
                writingPane
            case .previewOnly:
                previewPane
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Banner

    /// Only errors get a banner now. A success no longer needs one: the toolbar badge
    /// says the save worked, right where the click happened.
    ///
    /// An import is the exception. It has no review step by design, so its summary and
    /// its caveats — no key found, a section break that may be missing at a page
    /// boundary, chords that had to snap to a word start — have to land somewhere, and
    /// here is where they do not block typing.
    @ViewBuilder
    private var statusBanner: some View {
        recoveredDraftBanner
        importBanner
        if let errorText = model.errorText {
            HStack(spacing: GCSpacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(GCColor.danger)
                Text(errorText)
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
                Button {
                    model.errorText = nil
                } label: {
                    Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(GCColor.muted)
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)
            .background(GCColor.surfaceAlt)
            .overlay(alignment: .bottom) { Divider() }
        }
    }

    /// Work that came back from disk after a quit or a crash.
    ///
    /// Announced rather than restored silently, for one reason: the editor is now
    /// dirty against a song the server still has in its old state, and somebody who
    /// does not know that could publish text they do not remember writing. Discard is
    /// offered beside it because the other half of "we brought this back" has to be
    /// "and you can put it down".
    @ViewBuilder
    private var recoveredDraftBanner: some View {
        if let savedAt = model.restoredDraftAt {
            HStack(alignment: .top, spacing: GCSpacing.sm) {
                Image(systemName: "clock.arrow.circlepath").foregroundStyle(GCColor.accent)
                Text("Restored unsaved changes from \(savedAt.formatted(date: .abbreviated, time: .shortened)). They are not saved yet.")
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
                Button("Discard") { model.discardRestoredDraft() }
                    .buttonStyle(.link)
                    .gcTextStyle(.rowMeta)
                Button {
                    model.dismissRestoredDraftBanner()
                } label: {
                    Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(GCColor.muted)
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)
            .background(GCColor.surfaceAlt)
            .overlay(alignment: .bottom) { Divider() }
        }
    }

    @ViewBuilder
    private var importBanner: some View {
        if let summary = model.importSummary {
            HStack(alignment: .top, spacing: GCSpacing.sm) {
                Image(systemName: model.importNeedsAttention ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(model.importNeedsAttention ? GCColor.accent : GCColor.success)
                Text(summary)
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer()
                // Offered only when the result is worth investigating. The JSON it
                // copies is the complete input to core's buildSongDraft, so
                // `node apps/studio/js/pdf-draft.mjs` reproduces this exact result —
                // which is how a chart that came out wrong gets the heuristics fixed.
                if model.importNeedsAttention {
                    Button("Copy Diagnostics") { model.copyImportDiagnostics() }
                        .buttonStyle(.link)
                        .gcTextStyle(.rowMeta)
                }
                Button {
                    model.dismissImportSummary()
                } label: {
                    Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(GCColor.muted)
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)
            .background(GCColor.surfaceAlt)
            .overlay(alignment: .bottom) { Divider() }
        }
    }

    // MARK: - Writing pane

    private var writingPane: some View {
        VStack(spacing: 0) {
            detailsHeader
            if showsDetails {
                Divider()
                // No ScrollView and no height cap: four rows cannot realistically
                // overflow, and every fixed height tried here reserved space the form
                // did not use, leaving a dead band above the ChordPro divider and
                // taking it from the body. Collapsing Details is the escape hatch on a
                // short window.
                metadataForm
                    .padding(.horizontal, GCSpacing.lg)
                    // A little air under the header — the first cut had the Title label
                    // almost touching it.
                    .padding(.top, GCSpacing.lg)
                    .padding(.bottom, GCSpacing.lg)
            }
            Divider()
            chordproEditor
        }
        .frame(minWidth: Self.writingMinimumWidth, maxHeight: .infinity)
    }

    private var detailsHeader: some View {
        Button {
            showsDetails.toggle()
        } label: {
            HStack(spacing: GCSpacing.sm) {
                Image(systemName: showsDetails ? "chevron.down" : "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(GCColor.muted)
                Text("Details").gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                if !showsDetails, !collapsedSummary.isEmpty {
                    Text(collapsedSummary)
                        .gcTextStyle(.overline)
                        .foregroundStyle(GCColor.muted)
                        .lineLimit(1)
                }
                Spacer()
                // One summary of what publishing still needs, instead of repeating
                // "required to publish" under each field. Amber, not red: saving is
                // not blocked, and 8 songs already in the catalog are in this state.
                if !model.form.isPublishable {
                    Text("Needs \(model.form.missingForPublish.formattedList) to publish")
                        .gcTextStyle(.overline)
                        .foregroundStyle(GCColor.star)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(showsDetails ? "Hide the song details" : "Show the song details")
    }

    private var collapsedSummary: String {
        var parts: [String] = []
        if !model.form.defaultKey.isEmpty { parts.append(model.form.defaultKey) }
        if let tempo = model.form.tempoValue { parts.append("\(tempo) bpm") }
        if !model.form.tags.isEmpty { parts.append(model.form.tags.joined(separator: ", ")) }
        return parts.isEmpty ? "" : "— " + parts.joined(separator: " · ")
    }

    // MARK: - Metadata form

    /// A four-column `Grid`, so the proportions are declared rather than guessed:
    /// Title and Artist take two columns each, Key two with Time and Tempo one each,
    /// Tags three with Language one. Grid keeps the columns aligned down the form,
    /// which is what stops it reading as a pile of differently-sized boxes.
    private var metadataForm: some View {
        Grid(alignment: .topLeading, horizontalSpacing: GCSpacing.md, verticalSpacing: GCSpacing.md) {
            GridRow {
                field("Title", requirement: .toSave, error: model.form.errors.title) {
                    TextField("Song title", text: $model.form.title)
                }
                .gridCellColumns(2)
                field("Artist") {
                    TextField("Optional", text: $model.form.artist)
                }
                .gridCellColumns(2)
            }
            GridRow {
                keyField.gridCellColumns(2)
                field("Time") {
                    Picker("", selection: $model.form.timeSignature) {
                        Text("None").tag("")
                        ForEach(SongForm.timeSignatures, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                }
                field("Tempo") {
                    TextField("BPM", text: $model.form.tempo)
                        .onChange(of: model.form.tempo) { _, new in
                            let clean = SongForm.sanitizedTempo(new)
                            if clean != new { model.form.tempo = clean }
                        }
                }
            }
            GridRow {
                field("Tags", requirement: .toPublish, error: model.form.errors.tags) {
                    TagField(tags: $model.form.tags, knownTags: knownTags)
                }
                .gridCellColumns(3)
                field("Language") {
                    Picker("", selection: $model.form.language) {
                        Text("None").tag("")
                        ForEach(SongForm.languages, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                }
            }
            GridRow {
                field("YouTube", warning: youtubeWarning) {
                    TextField("URL or video ID", text: $model.form.youtubeID)
                        .onSubmit(normalizeYouTube)
                }
                .gridCellColumns(2)
                field("Country") {
                    TextField("Optional", text: $model.form.country)
                }
                .gridCellColumns(2)
            }
        }
        .textFieldStyle(.roundedBorder)
        .frame(maxWidth: Self.formMaximumWidth, alignment: .leading)
    }

    /// Key plus the ♯/♭ toggle that decides which spellings the picker offers. Both
    /// live in one cell because they are one decision: Eb and D# are the same key,
    /// and the toggle re-spells the current selection rather than clearing it.
    private var keyField: some View {
        field("Key", requirement: .toPublish, error: model.form.errors.defaultKey) {
            HStack(spacing: GCSpacing.sm) {
                Picker("", selection: $model.form.defaultKey) {
                    Text("Choose…").tag("")
                    Section("Major") {
                        ForEach(SongForm.majorKeys(accidental), id: \.self) { Text($0).tag($0) }
                    }
                    Section("Minor") {
                        ForEach(SongForm.minorKeys(accidental), id: \.self) { Text($0).tag($0) }
                    }
                }
                .labelsHidden()

                Picker("", selection: accidentalBinding) {
                    ForEach(SongForm.Accidental.allCases) { Text($0.symbol).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
                .help("Show keys as sharps or flats")
            }
        }
    }

    /// Seeded from the key already chosen, so a song in Eb opens on ♭.
    private var accidental: SongForm.Accidental {
        accidentalOverride ?? SongForm.accidental(of: model.form.defaultKey)
    }

    @State private var accidentalOverride: SongForm.Accidental?

    private var accidentalBinding: Binding<SongForm.Accidental> {
        Binding(
            get: { accidental },
            set: { next in
                accidentalOverride = next
                // Carry the selection across the flip instead of dropping it.
                if let respelled = SongForm.respelled(model.form.defaultKey, as: next) {
                    model.form.defaultKey = respelled
                }
            }
        )
    }

    private var youtubeWarning: String? {
        let raw = model.form.youtubeID.trimmed
        guard !raw.isEmpty else { return nil }
        return SongForm.normalizeYouTube(raw).valid ? nil : "Not a YouTube URL or ID"
    }

    private func normalizeYouTube() {
        let result = SongForm.normalizeYouTube(model.form.youtubeID)
        if result.valid { model.form.youtubeID = result.id }
    }

    /// How badly a field is needed. Distinguished because Save and Publish have
    /// different bars: only the title blocks a save, while the key and tags block
    /// only publication.
    private enum FieldRequirement {
        case optional
        /// Blocks saving. Red.
        case toSave
        /// Blocks publishing only. Amber.
        case toPublish

        var marker: Color? {
            switch self {
            case .optional: return nil
            case .toSave: return GCColor.danger
            case .toPublish: return GCColor.star
            }
        }
    }

    @ViewBuilder
    private func field<Content: View>(
        _ label: String,
        requirement: FieldRequirement = .optional,
        error: String? = nil,
        warning: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 2) {
                Text(label).gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                if let marker = requirement.marker {
                    Text("*").gcTextStyle(.overline).foregroundStyle(marker)
                }
                if let error = error {
                    Text(error)
                        .gcTextStyle(.overline)
                        .foregroundStyle(requirement.marker ?? GCColor.danger)
                } else if let warning = warning {
                    Text(warning).gcTextStyle(.overline).foregroundStyle(GCColor.star)
                }
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - ChordPro editor

    private var chordproEditor: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: GCSpacing.sm) {
                Text("ChordPro").gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                Spacer()
                if !model.form.chordproContent.isEmpty {
                    Text("\(model.form.chordproContent.count) characters")
                        .gcTextStyle(.overline)
                        .foregroundStyle(GCColor.muted)
                }
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)

            ChordProToolbar(
                key: model.form.defaultKey,
                hasSelection: model.hasSelection,
                bridge: model.bridge,
                onInsert: model.insert,
                onWrap: model.wrap,
                macroSource: { model.selectedText.isEmpty ? model.form.chordproContent : model.selectedText }
            )

            // Font size and line spacing are passed rather than applied as
            // modifiers: they are the highlighter's metrics too (it builds the bold
            // and semibold faces from that size), so there is one number, not a
            // SwiftUI one and an AppKit one that can drift apart.
            ChordProTextView(
                text: $model.form.chordproContent,
                selection: $model.selection,
                documentID: model.instanceID,
                fontSize: 12.5,
                lineSpacing: 2
            )
            // `maxHeight: .infinity` is not cosmetic. It was load-bearing for the
            // TextEditor this replaced, whose ideal height is its content height —
            // with only a minimum declared, that ideal propagated up through the pane
            // and the split view to the window, and a 60-line import stretched the
            // window taller than the screen. An NSScrollView has no such ideal, so it
            // no longer averts that; it is kept because the editor should still take
            // the height the window offers rather than the 200 it needs.
            .frame(minHeight: 200, maxHeight: .infinity)

            // Below the body, not above it: the strip appears and disappears as the
            // song changes, and anything that moves the text you are typing in is
            // worse than anything that moves the footer under it.
            LintStrip(
                warnings: model.warnings,
                canJump: model.canJump(to:),
                onJump: { model.jump(to: $0) }
            )
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Preview pane

    private var previewPane: some View {
        VStack(spacing: 0) {
            HStack(spacing: GCSpacing.sm) {
                Text("Preview").gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                Spacer()
                if !model.form.defaultKey.isEmpty {
                    Text(model.form.defaultKey)
                        .gcTextStyle(.overline)
                        .foregroundStyle(GCColor.textAccent)
                }
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)
            Divider()

            ScrollView {
                previewBody
                    .padding(GCSpacing.lg)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .background(GCColor.bg)
        }
        .frame(minWidth: Self.previewMinimumWidth, maxHeight: .infinity)
    }

    @ViewBuilder
    private var previewBody: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            // A parse failure is shown ABOVE the last good chart rather than
            // replacing it: mid-edit a body is transiently unparseable, and blanking
            // the pane on those keystrokes would make the preview unusable.
            if let parseError = model.previewErrorText {
                HStack(alignment: .firstTextBaseline, spacing: GCSpacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(GCColor.star)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Cannot draw this chart yet")
                            .gcTextStyle(.rowMeta)
                            .foregroundStyle(GCColor.ink)
                        Text(parseError)
                            .gcTextStyle(.overline)
                            .foregroundStyle(GCColor.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(GCSpacing.sm)
                .background(GCColor.surfaceAlt, in: RoundedRectangle(cornerRadius: GCRadius.sm))
            }

            if let doc = model.previewDoc {
                ChordChartView(doc: doc, options: .default)
            } else if model.form.chordproContent.trimmed.isEmpty {
                VStack(alignment: .leading, spacing: GCSpacing.xs) {
                    Text("Nothing to preview yet").gcTextStyle(.body).foregroundStyle(GCColor.ink)
                    Text("Type ChordPro on the left and the chart appears here.")
                        .gcTextStyle(.rowMeta).foregroundStyle(GCColor.muted)
                }
            } else {
                // Never parsed successfully even once — show the recovered lyrics,
                // the same fallback the Viewer uses.
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(model.rawFallbackLines.enumerated()), id: \.offset) { _, line in
                        Text(line.isEmpty ? " " : line)
                            .font(.system(size: GCChartMetrics.lyricSize))
                            .foregroundStyle(GCColor.ink)
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarItems: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            Button(action: onNewSong) {
                // Not `square.and.pencil` — that is the Manage section's own icon in
                // the picker immediately to the right, and two identical glyphs side by
                // side read as the same control twice. A doc-with-plus badge says "make
                // a new one" rather than "edit".
                Label("New Song", systemImage: "doc.badge.plus")
            }
            .keyboardShortcut("n", modifiers: .command)
            .help("New song (⌘N)")
        }

        ToolbarItem(placement: .navigation) {
            Button {
                model.showsImportSheet = true
            } label: {
                // An arrow into a document: content coming IN. Distinct from Save's
                // `square.and.arrow.down` and the Viewer's export arrow, both of which
                // are about content going out.
                //
                // Verified against CoreGlyphs' name_availability.plist, not guessed:
                // `document.badge.arrow.down` reads perfectly plausibly and does not
                // exist, and an unknown name is a runtime fault with a blank toolbar
                // button, not a build error.
                Label("Import from PDF", systemImage: "arrow.down.document")
            }
            .disabled(model.isImporting)
            .help("Import a chord sheet from a PDF (⇧⌘I)")
        }

        ToolbarItem(placement: .primaryAction) {
            Button {
                if isWide { model.showsPreview.toggle() } else { narrowShowsPreview.toggle() }
            } label: {
                Label("Preview", systemImage: isPreviewVisible ? "sidebar.right" : "sidebar.squares.right")
            }
            .keyboardShortcut("p", modifiers: .command)
            .help(previewToggleHelp)
            .foregroundStyle(isPreviewVisible ? GCColor.accent : GCColor.sec)
        }

        ToolbarItem(placement: .primaryAction) {
            Button {
                Task { await model.save() }
            } label: {
                badged("square.and.arrow.down", outcome: model.saveOutcome)
            }
            .keyboardShortcut("s", modifiers: .command)
            .disabled(!model.form.isSavable || model.isSaving)
            .help(model.form.isSavable ? "Save (⌘S)" : "Give this song a title first")
            .accessibilityLabel("Save")
        }

        ToolbarItem(placement: .primaryAction) {
            Button {
                Task { await model.publish() }
            } label: {
                badged(
                    model.publishOutcome == .succeeded ? "checkmark.icloud" : "icloud.and.arrow.up",
                    outcome: model.publishOutcome == .succeeded ? .idle : model.publishOutcome
                )
            }
            .disabled(model.isNew || model.isSaving || model.status == .published)
            .help(publishHelp)
            .accessibilityLabel("Publish")
        }

        ToolbarItem(placement: .primaryAction) {
            Button(role: .destructive) {
                showsDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
            .disabled(model.isNew || model.isSaving)
            .help("Delete this song permanently")
        }

        if model.status == .published {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Unpublish") { Task { await model.unpublish() } }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
                .disabled(model.isSaving)
            }
        }
    }

    /// An icon with a small success/failure badge in its corner. The badge is the
    /// whole reason these buttons are icons: it puts the verdict on the control that
    /// was just pressed, so no separate status chip has to exist to carry it.
    private func badged(_ systemImage: String, outcome: SongEditorModel.ActionOutcome) -> some View {
        Image(systemName: systemImage)
            .overlay(alignment: .bottomTrailing) {
                switch outcome {
                case .idle:
                    EmptyView()
                case .succeeded:
                    badge("checkmark.circle.fill", tint: GCColor.success)
                case .failed:
                    badge("xmark.circle.fill", tint: GCColor.danger)
                }
            }
    }

    private func badge(_ systemImage: String, tint: Color) -> some View {
        Image(systemName: systemImage)
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(tint)
            // A ring in the toolbar's own colour so the badge reads against whatever
            // the icon behind it is doing.
            .background(Circle().fill(GCColor.surface).frame(width: 9, height: 9))
            .offset(x: 3, y: 2)
    }

    private var previewToggleHelp: String {
        if isWide {
            return isPreviewVisible ? "Hide the preview (⌘P)" : "Show the preview (⌘P)"
        }
        return isPreviewVisible
            ? "Back to the editor (⌘P) — too narrow to show both"
            : "Show the preview (⌘P) — too narrow to show both"
    }

    private var publishHelp: String {
        if model.status == .published { return "Already published" }
        if model.isNew { return "Save this song before publishing it" }
        if !model.form.isPublishable {
            return "Needs \(model.form.missingForPublish.formattedList) before publishing"
        }
        return "Publish — make this song live in the public library"
    }
}

extension Array where Element == String {
    /// "a key", "a key and a tag", "a title, a key and a tag" — for one readable
    /// sentence about what is missing instead of a list of per-field errors.
    var formattedList: String {
        switch count {
        case 0: return ""
        case 1: return self[0]
        case 2: return "\(self[0]) and \(self[1])"
        default: return dropLast().joined(separator: ", ") + " and " + self[count - 1]
        }
    }
}
