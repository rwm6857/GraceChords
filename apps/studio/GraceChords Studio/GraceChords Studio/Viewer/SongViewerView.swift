//
//  SongViewerView.swift
//  GraceChords Studio
//
//  One song: header, chart, and the live view controls.
//
//  Structural port of apps/mobile/app/viewer/[slug].tsx. State lives in
//  SongViewerModel; this file is the presentation and the platform translation of
//  mobile's chrome:
//
//   - mobile's floating auto-hiding header becomes an in-content header plus real
//     window-toolbar buttons, because a Mac window already has a title bar and
//     hiding the only way back would be hostile.
//   - its bottom sheets become popovers anchored to the buttons that open them.
//   - the transpose bar stays a floating pill over the chart, which translates
//     directly and is the control a musician reaches for mid-song.
//
//  Every failure keeps a visible resting state: no bundle, a parse error, a missing
//  song, an expired session. A body the parser cannot handle still shows its lyrics.
//

import SwiftUI

struct SongViewerView: View {
    let slug: String
    let services: AppServices
    var showsBackButton: Bool
    var onBack: () -> Void
    var onSessionExpired: () -> Void

    @StateObject private var model: SongViewerModel
    @ObservedObject private var defaults: StudioDefaults
    @ObservedObject private var prefs: ViewerPrefs

    @State private var openPanel: Panel?
    /// Width of the chart area, which decides whether two columns are offered.
    @State private var availableWidth: CGFloat = 0

    private enum Panel: String, Identifiable {
        case options, export, key
        var id: String { rawValue }
    }

    /// Below this the second column is too narrow to read, so it is not offered —
    /// the same judgement mobile makes by restricting it to tablet widths.
    private static let twoColumnMinimumWidth: CGFloat = 900

    init(
        slug: String,
        services: AppServices,
        showsBackButton: Bool,
        onBack: @escaping () -> Void,
        onSessionExpired: @escaping () -> Void,
        defaults: StudioDefaults = .shared,
        prefs: ViewerPrefs = .shared
    ) {
        self.slug = slug
        self.services = services
        self.showsBackButton = showsBackButton
        self.onBack = onBack
        self.onSessionExpired = onSessionExpired
        self.defaults = defaults
        self.prefs = prefs
        _model = StateObject(wrappedValue: SongViewerModel(slug: slug, services: services, defaults: defaults))
    }

    private var offersTwoColumns: Bool { availableWidth >= Self.twoColumnMinimumWidth }
    private var columnMode: ColumnMode { offersTwoColumns ? prefs.columnMode(for: slug) : .single }

    private var chartOptions: ChartRenderOptions {
        ChartRenderOptions(
            showChords: model.showChords,
            showSections: model.showSections,
            fontScale: model.fontScale,
            splitInstrumentals: columnMode == .double
        )
    }

    var body: some View {
        content
            .navigationTitle(model.song?.title ?? "Song")
            .toolbar { toolbarItems }
            .task(id: slug) {
                model.onSessionExpired = onSessionExpired
                await model.load()
            }
            .keepScreenAwake(defaults.keepAwake)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let errorText = model.errorText {
            message(errorText, retry: true)
        } else if let song = model.song {
            loaded(song)
        } else {
            message("Song not found.", retry: false)
        }
    }

    /// The chart, plus the transpose bar floating over it.
    private func loaded(_ song: SongDetail) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(alignment: .leading, spacing: GCSpacing.lg) {
                        header(for: song)
                        Divider()
                        chart(for: song, viewportHeight: geometry.size.height)
                    }
                    .frame(maxWidth: GCLayout.MaxWidth.content, alignment: .leading)
                    .padding(GCSpacing.xl)
                    // Room for the last lines to clear the floating bar.
                    .padding(.bottom, model.showsTransposeBar ? 96 : 0)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }

                if model.showsTransposeBar {
                    TransposeBar(
                        keyLabel: model.keyLabel,
                        capoText: model.capoText,
                        onDown: { model.transpose(by: -1) },
                        onUp: { model.transpose(by: 1) },
                        onChooseKey: { openPanel = .key }
                    )
                    .padding(.bottom, 26)
                    .popover(isPresented: isPresented(.key), arrowEdge: .top) { keyPicker }
                }
            }
            .onAppear { availableWidth = geometry.size.width }
            .onChange(of: geometry.size.width) { _, width in availableWidth = width }
        }
    }

    // MARK: - Header

    @ViewBuilder
    private func header(for song: SongDetail) -> some View {
        VStack(alignment: .leading, spacing: GCSpacing.xs) {
            HStack(alignment: .firstTextBaseline, spacing: GCSpacing.sm) {
                Text(song.title)
                    .gcTextStyle(.largeTitle)
                    .foregroundStyle(GCColor.ink)
                    .lineLimit(2)
                StarButton(songID: song.id, services: services)
            }
            // Subtitle row: artist · Key pill · time signature · BPM.
            HStack(spacing: GCSpacing.sm) {
                if let artist = song.artist, !artist.isEmpty {
                    Text(artist)
                        .gcTextStyle(.rowSubtitle)
                        .foregroundStyle(GCColor.sec)
                    if !model.keyLabel.isEmpty {
                        Circle().fill(GCColor.muted).frame(width: 3, height: 3)
                    }
                }
                if !model.keyLabel.isEmpty {
                    Text("Key of \(model.keyLabel)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(GCColor.textAccent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(GCColor.accentSoft, in: Capsule())
                }
                if let timeSignature = song.timeSignature, !timeSignature.isEmpty {
                    Text(timeSignature).gcTextStyle(.rowMeta).foregroundStyle(GCColor.muted)
                }
                if let tempo = song.tempo {
                    Text("\(tempo) bpm").gcTextStyle(.rowMeta).foregroundStyle(GCColor.muted)
                }
            }
        }
    }

    // MARK: - Chart

    @ViewBuilder
    private func chart(for song: SongDetail, viewportHeight: CGFloat) -> some View {
        if let doc = model.doc {
            if columnMode == .double {
                TwoColumnChartView(doc: doc, options: chartOptions, viewportHeight: viewportHeight)
            } else {
                ChordChartView(doc: doc, options: chartOptions)
            }
        } else if let parseErrorText = model.parseErrorText {
            rawFallback(song, note: parseErrorText)
        } else if (song.chordproContent ?? "").isEmpty {
            VStack(alignment: .leading, spacing: GCSpacing.xs) {
                Text("No chart available").gcTextStyle(.body).foregroundStyle(GCColor.ink)
                Text("This song has no ChordPro content yet.")
                    .gcTextStyle(.rowMeta).foregroundStyle(GCColor.muted)
            }
        } else {
            rawFallback(song, note: nil)
        }
    }

    /// Lyrics recovered from a body the parser could not handle — better than an
    /// empty page, and the same fallback mobile shows.
    @ViewBuilder
    private func rawFallback(_ song: SongDetail, note: String?) -> some View {
        let lines = SongViewerModel.rawFallbackLines(from: song.chordproContent ?? "")
        VStack(alignment: .leading, spacing: 0) {
            if note != nil {
                Text("Chords unavailable — showing raw text")
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.muted)
                    .padding(.bottom, GCSpacing.md)
            }
            if lines.contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line.isEmpty ? " " : line)
                        .font(.system(size: GCChartMetrics.lyricSize * model.fontScale))
                        .foregroundStyle(GCColor.ink)
                        .textSelection(.enabled)
                }
            } else {
                Text("No chart available").gcTextStyle(.body).foregroundStyle(GCColor.ink)
                Text("This song has no ChordPro content yet.")
                    .gcTextStyle(.rowMeta).foregroundStyle(GCColor.muted)
            }
        }
    }

    // MARK: - Toolbar and panels

    @ToolbarContentBuilder
    private var toolbarItems: some ToolbarContent {
        if showsBackButton {
            ToolbarItem(placement: .navigation) {
                Button(action: onBack) {
                    Label("Library", systemImage: "chevron.left")
                }
                .help("Back to Library")
            }
        }
        ToolbarItem(placement: .primaryAction) {
            Button { openPanel = .options } label: {
                Label("View options", systemImage: "ellipsis")
            }
            .help("View options")
            .disabled(model.song == nil)
            .popover(isPresented: isPresented(.options), arrowEdge: .bottom) {
                ViewOptionsView(
                    model: model,
                    defaults: defaults,
                    columnMode: offersTwoColumns ? columnMode : nil,
                    onColumnMode: offersTwoColumns
                        ? { prefs.setColumnMode($0, for: slug) }
                        : nil
                )
            }
        }
        ToolbarItem(placement: .primaryAction) {
            Button { openPanel = .export } label: {
                Label("Export and share", systemImage: "square.and.arrow.up")
            }
            .help("Export and share")
            .disabled(model.song == nil)
            .popover(isPresented: isPresented(.export), arrowEdge: .bottom) {
                if let song = model.song {
                    ExportView(
                        song: song,
                        // Mobile exports at the displayed key only when transposed;
                        // an untouched song exports in its own key.
                        exportKey: model.steps == 0 ? "" : model.keyLabel,
                        services: services,
                        onClose: { openPanel = nil }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var keyPicker: some View {
        KeyPickerView(
            songTitle: model.song?.title ?? "",
            currentKey: model.keyLabel.isEmpty ? nil : model.keyLabel,
            nativeKey: model.nativeKey.isEmpty ? nil : model.nativeKey,
            hasOverride: model.steps != 0,
            accidental: model.accidental,
            onAccidental: { model.setAccidental($0) },
            onPick: { model.pick(key: $0) },
            onClose: { openPanel = nil }
        )
    }

    /// One `openPanel` drives all three popovers, so opening one closes the others.
    private func isPresented(_ panel: Panel) -> Binding<Bool> {
        Binding(
            get: { openPanel == panel },
            set: { shown in
                if shown { openPanel = panel } else if openPanel == panel { openPanel = nil }
            }
        )
    }

    @ViewBuilder
    private func message(_ text: String, retry: Bool) -> some View {
        VStack(alignment: .leading, spacing: GCSpacing.sm) {
            Text(text)
                .gcTextStyle(.body)
                .foregroundStyle(GCColor.sec)
                .fixedSize(horizontal: false, vertical: true)
            if retry {
                Button("Try Again") { Task { await model.load() } }
            }
        }
        .padding(GCSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
