//
//  SongViewerView.swift
//  GraceChords Studio
//
//  Fetches one song's ChordPro body, parses it through CoreBridge (packages/core's
//  parseChordProOrLegacy, running in JavaScriptCore), and renders it.
//
//  Every failure has a visible resting state: no bundle, a parse error, a missing
//  song, an expired session. A parse error still shows the raw body, the same
//  fallback apps/mobile's viewer uses.
//

import SwiftUI

struct SongViewerView: View {
    let slug: String
    let services: AppServices
    var showsBackButton: Bool
    var onBack: () -> Void
    var onSessionExpired: () -> Void

    @State private var song: SongDetail?
    @State private var doc: SongDoc?
    @State private var isLoading = true
    @State private var errorText: String?
    @State private var parseErrorText: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if isLoading {
                    ProgressView().frame(maxWidth: .infinity, alignment: .center)
                } else if let errorText = errorText {
                    message(errorText, retry: true)
                } else if let song = song {
                    header(for: song)
                    Divider()
                    chart(for: song)
                } else {
                    message("Song not found.", retry: false)
                }
            }
            .frame(maxWidth: 760, alignment: .leading)
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .navigationTitle(song?.title ?? "Song")
        .toolbar {
            if showsBackButton {
                ToolbarItem(placement: .navigation) {
                    Button(action: onBack) {
                        Label("Library", systemImage: "chevron.left")
                    }
                    .help("Back to Library")
                }
            }
        }
        .task(id: slug) {
            await load()
        }
    }

    @ViewBuilder
    private func header(for song: SongDetail) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(song.title)
                .font(.title2.weight(.semibold))
            if let artist = song.artist, !artist.isEmpty {
                Text(artist)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            let details = metaDetails(for: song)
            if !details.isEmpty {
                Text(details.joined(separator: "  •  "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func chart(for song: SongDetail) -> some View {
        if let doc = doc {
            ChordChartView(doc: doc)
        } else if let parseErrorText = parseErrorText {
            VStack(alignment: .leading, spacing: 10) {
                Text(parseErrorText)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
                // Raw body fallback, as on mobile — better than an empty page.
                Text(song.chordproContent ?? "")
                    .font(.system(size: 13, design: .monospaced))
                    .textSelection(.enabled)
            }
        } else {
            Text("This song has no chart content yet.")
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func message(_ text: String, retry: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if retry {
                Button("Try Again") { Task { await load() } }
            }
        }
    }

    private func metaDetails(for song: SongDetail) -> [String] {
        var details: [String] = []
        if let key = song.defaultKey, !key.isEmpty { details.append("Key of \(key)") }
        if let tempo = song.tempo { details.append("\(tempo) bpm") }
        if let timeSignature = song.timeSignature, !timeSignature.isEmpty {
            details.append(timeSignature)
        }
        return details
    }

    private func load() async {
        isLoading = true
        errorText = nil
        parseErrorText = nil
        doc = nil

        do {
            let fetched = try await services.songs.fetchSong(slug: slug)
            song = fetched
            if let content = fetched?.chordproContent, !content.isEmpty {
                parse(content)
            }
        } catch SongsRepositoryError.sessionExpired {
            onSessionExpired()
        } catch {
            errorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }

        isLoading = false
    }

    private func parse(_ content: String) {
        guard let bridge = services.bridge else {
            parseErrorText = services.bridgeErrorText ?? "The ChordPro parser is unavailable."
            return
        }
        do {
            doc = try bridge.parse(content)
        } catch {
            parseErrorText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
        }
    }
}
