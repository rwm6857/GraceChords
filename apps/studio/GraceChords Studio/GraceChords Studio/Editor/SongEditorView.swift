//
//  SongEditorView.swift
//  GraceChords Studio
//
//  One song being written: metadata form, plain-text ChordPro editor, live preview.
//
//  Layout is a horizontal split — editor left, preview right — with the preview
//  toggleable rather than permanent. On a 13" display the metadata form plus two
//  panes is genuinely cramped, and while writing a verse the preview is often not
//  what you want the width for.
//
//  The preview is `ChordChartView`, the SAME view the Song Viewer draws, fed the
//  same `SongDoc` from the same bridged parser. There is deliberately no
//  editor-specific renderer: a preview that could disagree with the Viewer would be
//  worse than no preview.
//
//  The editor itself is a plain monospaced `TextEditor`. Syntax highlighting for
//  [chords] and {directives} is NOT here — SwiftUI's TextEditor cannot style
//  ranges, so it would mean dropping to NSTextView via NSViewRepresentable with a
//  custom NSTextStorage, which brings its own problems (attribute runs fighting the
//  undo manager, IME marked-text ranges, re-highlight cost on a long song) and is
//  orthogonal to whether saving and publishing work. See apps/studio/README.md.
//

import SwiftUI

struct SongEditorView: View {
    @ObservedObject var model: SongEditorModel
    /// Tags already in the catalog, so a typed tag snaps to their spelling instead of
    /// minting a case-variant duplicate. See `SongForm.addTag`.
    var knownTags: [String] = []
    var onClose: () -> Void

    @State private var pendingTag = ""
    @State private var showsDeleteConfirmation = false
    @State private var showsDiscardConfirmation = false
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
    /// 240–300 this pane is that much narrower than the window around it, which is
    /// why the first cut's 900 meant the preview never appeared at an ordinary window
    /// size. A 1000pt window with the sidebar at its 240 minimum leaves ~740 here.
    private static let writingMinimumWidth: CGFloat = 360
    private static let previewMinimumWidth: CGFloat = 320
    private static let splitMinimumWidth: CGFloat = writingMinimumWidth + previewMinimumWidth

    @State private var availableWidth: CGFloat = 0

    private enum PaneLayout { case editorOnly, previewOnly, split }

    private var isWide: Bool { availableWidth >= Self.splitMinimumWidth }

    private var paneLayout: PaneLayout {
        if isWide { return model.showsPreview ? .split : .editorOnly }
        return narrowShowsPreview ? .previewOnly : .editorOnly
    }

    /// Whether the preview is on screen at all, in either layout.
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
            .alert("Discard unsaved changes?", isPresented: $showsDiscardConfirmation) {
                Button("Keep Editing", role: .cancel) {}
                Button("Discard", role: .destructive) { onClose() }
            } message: {
                Text("Your edits to “\(model.windowTitle)” have not been saved. Closing the editor loses them.")
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
                Button("Back to Songs") { onClose() }
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
    }

    // MARK: - Banners

    @ViewBuilder
    private var statusBanner: some View {
        if let errorText = model.errorText {
            banner(errorText, icon: "exclamationmark.triangle.fill", tint: GCColor.danger) {
                model.errorText = nil
            }
        } else if let statusMessage = model.statusMessage {
            banner(statusMessage, icon: "checkmark.circle.fill", tint: GCColor.success) {
                model.statusMessage = nil
            }
        }
    }

    private func banner(
        _ text: String,
        icon: String,
        tint: Color,
        dismiss: @escaping () -> Void
    ) -> some View {
        HStack(spacing: GCSpacing.sm) {
            Image(systemName: icon).foregroundStyle(tint)
            Text(text)
                .gcTextStyle(.rowMeta)
                .foregroundStyle(GCColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(GCColor.muted)
        }
        .padding(.horizontal, GCSpacing.md)
        .padding(.vertical, GCSpacing.sm)
        .background(GCColor.surfaceAlt)
        .overlay(alignment: .bottom) { Divider() }
    }

    // MARK: - Writing pane

    private var writingPane: some View {
        VStack(spacing: 0) {
            detailsHeader
            if showsDetails {
                Divider()
                // Sized to its content, not to a fixed height. The first cut pinned
                // this to 320pt, which left a band of dead space under the last row
                // on every song and took it away from the editor.
                metadataForm
                    .padding(.horizontal, GCSpacing.lg)
                    .padding(.bottom, GCSpacing.lg)
            }
            Divider()
            chordproEditor
        }
        .frame(minWidth: Self.writingMinimumWidth)
    }

    /// Collapsible header for the metadata form. Collapsed, it summarises what is
    /// hidden — a bare chevron over nothing would make the user open it to remember
    /// whether the key was set.
    private var detailsHeader: some View {
        Button {
            showsDetails.toggle()
        } label: {
            HStack(spacing: GCSpacing.sm) {
                Image(systemName: showsDetails ? "chevron.down" : "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(GCColor.muted)
                Text("Details").gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                if !showsDetails {
                    Text(collapsedSummary)
                        .gcTextStyle(.overline)
                        .foregroundStyle(GCColor.muted)
                        .lineLimit(1)
                }
                Spacer()
                if !model.form.isPublishable {
                    // Amber, not red, and worded as a publish precondition — because
                    // saving is not blocked by it. 8 songs already in the catalog have
                    // no tags; the editor must not present those as broken.
                    Label(
                        model.status == .published ? "Missing details" : "Not ready to publish",
                        systemImage: "exclamationmark.circle"
                    )
                    .gcTextStyle(.overline)
                    .foregroundStyle(GCColor.star)
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
        if !model.form.defaultKey.isEmpty { parts.append("Key of \(model.form.defaultKey)") }
        if let tempo = model.form.tempoValue { parts.append("\(tempo) bpm") }
        if !model.form.tags.isEmpty { parts.append(model.form.tags.joined(separator: ", ")) }
        return parts.isEmpty ? "" : "— " + parts.joined(separator: " · ")
    }

    private var metadataForm: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            HStack(alignment: .top, spacing: GCSpacing.md) {
                field("Title", requirement: .toSave, error: model.form.errors.title) {
                    TextField("Song title", text: $model.form.title)
                }
                field("Artist", error: nil) {
                    TextField("Optional", text: $model.form.artist)
                }
            }
            HStack(alignment: .top, spacing: GCSpacing.md) {
                field("Key", requirement: .toPublish, error: model.form.errors.defaultKey) {
                    Picker("", selection: $model.form.defaultKey) {
                        Text("Choose…").tag("")
                        ForEach(SongForm.keys, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                }
                field("Time", error: nil) {
                    Picker("", selection: $model.form.timeSignature) {
                        Text("None").tag("")
                        ForEach(SongForm.timeSignatures, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                }
                field("Tempo", error: nil) {
                    TextField("BPM", text: $model.form.tempo)
                }
                field("Language", error: nil) {
                    Picker("", selection: $model.form.language) {
                        Text("None").tag("")
                        ForEach(SongForm.languages, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                }
            }
            tagsField
            HStack(alignment: .top, spacing: GCSpacing.md) {
                field("YouTube", error: nil, warning: youtubeWarning) {
                    TextField("URL or video ID", text: $model.form.youtubeID)
                        .onSubmit(normalizeYouTube)
                }
                field("Country", error: nil) {
                    TextField("Optional", text: $model.form.country)
                }
            }
        }
        .textFieldStyle(.roundedBorder)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var youtubeWarning: String? {
        let raw = model.form.youtubeID.trimmed
        guard !raw.isEmpty else { return nil }
        return SongForm.normalizeYouTube(raw).valid ? nil : "Not a recognised YouTube URL or ID"
    }

    private func normalizeYouTube() {
        let result = SongForm.normalizeYouTube(model.form.youtubeID)
        if result.valid { model.form.youtubeID = result.id }
    }

    private var tagsField: some View {
        field("Tags", requirement: .toPublish, error: model.form.errors.tags) {
            VStack(alignment: .leading, spacing: GCSpacing.sm) {
                HStack(spacing: GCSpacing.sm) {
                    TextField("Add a tag and press Return", text: $pendingTag)
                        .onSubmit(commitTag)
                    Button("Add", action: commitTag)
                        .disabled(pendingTag.trimmed.isEmpty)
                    if !suggestedTags.isEmpty {
                        Menu {
                            ForEach(suggestedTags, id: \.self) { tag in
                                Button(tag) { model.form.addTag(tag, knownTags: knownTags) }
                            }
                        } label: {
                            Image(systemName: "list.bullet")
                        }
                        .menuStyle(.borderlessButton)
                        .frame(width: 28)
                        .help("Add an existing tag from the catalog")
                    }
                }
                if !model.form.tags.isEmpty {
                    FlowLayout(horizontalSpacing: GCSpacing.xs, verticalSpacing: GCSpacing.xs) {
                        ForEach(model.form.tags, id: \.self) { tag in
                            HStack(spacing: 4) {
                                Text(tag).gcTextStyle(.rowMeta)
                                Button {
                                    model.form.removeTag(tag)
                                } label: {
                                    Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, GCSpacing.sm)
                            .padding(.vertical, 3)
                            .background(GCColor.accentSoft, in: Capsule())
                            .foregroundStyle(GCColor.textAccent)
                        }
                    }
                }
            }
        }
    }

    private func commitTag() {
        model.form.addTag(pendingTag, knownTags: knownTags)
        pendingTag = ""
    }

    /// Catalog tags not already on this song, most common first as supplied.
    /// Picking from here is how a tag stays spelled the way the rest of the catalog
    /// spells it.
    private var suggestedTags: [String] {
        knownTags.filter { candidate in
            !model.form.tags.contains { $0.caseInsensitiveCompare(candidate) == .orderedSame }
        }
    }

    /// How badly a field is needed. Distinguished because Save and Publish have
    /// different bars: only the title blocks a save, while the key and tags block
    /// only publication — so showing all three as equally red errors would say the
    /// editor is stuck when it is not.
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
        error: String?,
        warning: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 2) {
                Text(label).gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                if let marker = requirement.marker {
                    Text("*").gcTextStyle(.overline).foregroundStyle(marker)
                }
            }
            content()
            if let error = error {
                Text(requirement == .toPublish ? "\(error) to publish" : error)
                    .gcTextStyle(.overline)
                    .foregroundStyle(requirement.marker ?? GCColor.danger)
            } else if let warning = warning {
                Text(warning).gcTextStyle(.overline).foregroundStyle(GCColor.star)
            }
        }
    }

    // MARK: - ChordPro editor

    private var chordproEditor: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: GCSpacing.sm) {
                Text("ChordPro").gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                Spacer()
                Text("\(model.form.chordproContent.count) characters")
                    .gcTextStyle(.overline)
                    .foregroundStyle(GCColor.muted)
            }
            .padding(.horizontal, GCSpacing.md)
            .padding(.vertical, GCSpacing.sm)

            TextEditor(text: $model.form.chordproContent)
                .font(.system(size: 12.5, weight: .regular, design: .monospaced))
                .lineSpacing(2)
                // Spelling and autocorrect fight ChordPro constantly: {sov} and
                // [Bbmaj7] are not words, and macOS's automatic substitutions would
                // turn a straight quote in a lyric into a curly one that the parser
                // then carries into the chart.
                .disableAutocorrection(true)
                .scrollContentBackground(.hidden)
                .background(GCColor.bg)
                .frame(minHeight: 200)
        }
    }

    // MARK: - Preview pane

    private var previewPane: some View {
        VStack(spacing: 0) {
            HStack(spacing: GCSpacing.sm) {
                Text("Preview").gcTextStyle(.overline).foregroundStyle(GCColor.sec)
                if !model.form.defaultKey.isEmpty {
                    Text("Key of \(model.form.defaultKey)")
                        .gcTextStyle(.overline)
                        .foregroundStyle(GCColor.textAccent)
                }
                Spacer()
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

            LintWarningsView(warnings: model.warnings, isExpanded: $model.showsWarnings)
        }
        .frame(minWidth: Self.previewMinimumWidth)
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
                        Text("Cannot draw the chart for this text yet")
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
                ChordChartView(
                    doc: doc,
                    options: ChartRenderOptions(
                        showChords: true,
                        showSections: true,
                        fontScale: 1.0,
                        splitInstrumentals: false
                    )
                )
            } else if model.form.chordproContent.trimmed.isEmpty {
                VStack(alignment: .leading, spacing: GCSpacing.xs) {
                    Text("Nothing to preview yet").gcTextStyle(.body).foregroundStyle(GCColor.ink)
                    Text("Start typing ChordPro on the left and the chart appears here.")
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
            Button {
                if model.isDirty { showsDiscardConfirmation = true } else { onClose() }
            } label: {
                Label("Songs", systemImage: "chevron.left")
            }
            .help("Back to Songs")
        }

        // The toggle is always present, in both layouts. It was previously gated on
        // there being room for a split, which meant the preview — the whole point of
        // the editor — was simply unreachable in any window that was not very wide.
        ToolbarItem(placement: .primaryAction) {
            Button {
                if isWide { model.showsPreview.toggle() } else { narrowShowsPreview.toggle() }
            } label: {
                Label(
                    "Preview",
                    systemImage: isWide
                        ? (isPreviewVisible ? "sidebar.right" : "sidebar.squares.right")
                        : (isPreviewVisible ? "pencil" : "eye")
                )
            }
            .help(previewToggleHelp)
            .foregroundStyle(isPreviewVisible ? GCColor.accent : GCColor.sec)
        }

        ToolbarItem(placement: .primaryAction) {
            statusPill
        }

        ToolbarItem(placement: .primaryAction) {
            Button {
                Task { await model.save() }
            } label: {
                Text(model.status == .published ? "Save" : "Save Draft")
            }
            .keyboardShortcut("s", modifiers: .command)
            .disabled(!model.form.isSavable || model.isSaving)
            .help(model.form.isSavable ? "Save this song" : "Give this song a title first")
        }

        ToolbarItem(placement: .primaryAction) {
            Menu {
                if model.status == .draft {
                    Button("Publish…") { Task { await model.publish() } }
                        // Not disabled on incompleteness — the action reports what is
                        // missing. A silently disabled Publish with no explanation is
                        // how you get someone hunting for the reason.
                        .disabled(model.isNew || model.isDirty)
                } else {
                    Button("Unpublish") { Task { await model.unpublish() } }
                }
                Divider()
                Button("Delete Song…", role: .destructive) {
                    showsDeleteConfirmation = true
                }
                .disabled(model.isNew)
            } label: {
                Label("More", systemImage: "ellipsis.circle")
            }
            .disabled(model.isSaving)
        }
    }

    private var previewToggleHelp: String {
        if isWide {
            return isPreviewVisible ? "Hide the preview" : "Show the preview beside the editor"
        }
        // Named explicitly, because in a narrow pane the two swap rather than one
        // appearing next to the other, and a button that says "Show preview" while
        // hiding what you were typing needs to say so.
        return isPreviewVisible
            ? "Back to the editor — the pane is too narrow to show both"
            : "Show the preview instead of the editor — the pane is too narrow for both"
    }

    private var statusPill: some View {
        HStack(spacing: GCSpacing.xs) {
            Circle()
                .fill(model.status == .published ? GCColor.success : GCColor.star)
                .frame(width: 6, height: 6)
            Text(model.isNew ? "New draft" : (model.status == .published ? "Published" : "Draft"))
                .gcTextStyle(.overline)
                .foregroundStyle(GCColor.sec)
        }
        .padding(.horizontal, GCSpacing.sm)
        .padding(.vertical, 3)
        .background(GCColor.surfaceAlt, in: Capsule())
        .help(
            model.status == .published
                ? "This song is live in the public library. Saving an edit keeps it live."
                : "This song is a draft. Only editors can see it until you publish it."
        )
    }
}

