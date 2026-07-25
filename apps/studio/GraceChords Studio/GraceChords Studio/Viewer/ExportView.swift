//
//  ExportView.swift
//  GraceChords Studio
//
//  Export & share: PDF, JPG, and send to Telegram — the same three choices
//  apps/mobile's ExportSheet offers, in the same order.
//
//  Mobile hands the rendered bytes straight to the iOS share sheet. On macOS the
//  primary verb for a file is Save, so each format saves through NSSavePanel (which
//  is also what grants the sandbox permission to write where the user chose), and a
//  Share button hands the same file to NSSharingServicePicker for the cases where
//  passing it along is what you actually wanted.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import AppKit
import Combine
import SwiftUI
import UniformTypeIdentifiers

struct ExportView: View {
    let song: SongDetail
    /// The key to render in — empty means the song's own key, matching mobile.
    let exportKey: String
    let services: AppServices
    var onClose: () -> Void

    @StateObject private var model = ExportModel()

    var body: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            Text("Export and share")
                .gcTextStyle(.sectionHeader)
                .foregroundStyle(GCColor.ink)

            if !services.export.isConfigured {
                Text(ExportError.notConfigured.errorDescription ?? "")
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(spacing: GCSpacing.sm) {
                    ForEach(ExportFormat.allCases, id: \.self) { format in
                        formatButton(format)
                    }
                }

                Button {
                    Task { await model.share(format: .pdf, song: song, key: exportKey, services: services) }
                } label: {
                    Label("Share PDF…", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .disabled(model.isBusy)

                Divider()

                Button {
                    Task { await model.sendToTelegram(song: song, key: exportKey, services: services) }
                } label: {
                    HStack(spacing: GCSpacing.sm) {
                        Image(systemName: "paperplane.fill").foregroundStyle(GCColor.accent)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Send to Telegram")
                            Text("Optional bot").gcTextStyle(.rowMeta).foregroundStyle(GCColor.muted)
                        }
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
                .disabled(model.isBusy)
            }

            if model.isBusy {
                HStack(spacing: GCSpacing.sm) {
                    ProgressView().controlSize(.small)
                    Text("Rendering…").gcTextStyle(.rowMeta).foregroundStyle(GCColor.muted)
                }
            }
            if let status = model.statusText {
                Text(status)
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(model.statusIsError ? GCColor.danger : GCColor.success)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if model.showsTelegramLink {
                Link("Open Telegram to link your account", destination: ExportService.telegramBotURL)
                    .gcTextStyle(.rowMeta)
            }
        }
        .gcTextStyle(.body)
        .padding(GCSpacing.lg)
        .frame(width: 320)
    }

    private func formatButton(_ format: ExportFormat) -> some View {
        Button {
            Task { await model.save(format: format, song: song, key: exportKey, services: services) }
        } label: {
            VStack(spacing: GCSpacing.xs) {
                Image(systemName: format.systemImage).font(.system(size: 20))
                Text(format.displayName).gcTextStyle(.rowMeta)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, GCSpacing.md)
            .background(GCColor.surfaceAlt, in: RoundedRectangle(cornerRadius: GCRadius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(model.isBusy)
        .help("Save as \(format.displayName)")
    }
}

@MainActor
private final class ExportModel: ObservableObject {
    @Published private(set) var isBusy = false
    @Published private(set) var statusText: String?
    @Published private(set) var statusIsError = false
    @Published private(set) var showsTelegramLink = false

    func save(format: ExportFormat, song: SongDetail, key: String, services: AppServices) async {
        await run {
            let file = try await services.export.exportSong(
                songID: song.id, key: key, format: format)
            // The save panel is what grants the sandbox write access to the chosen
            // location — nothing is written until the user picks one.
            guard let destination = await Self.promptForDestination(filename: file.filename) else {
                return nil
            }
            try file.data.write(to: destination)
            return "Saved to \(destination.lastPathComponent)."
        }
    }

    func share(format: ExportFormat, song: SongDetail, key: String, services: AppServices) async {
        await run {
            let file = try await services.export.exportSong(
                songID: song.id, key: key, format: format)
            // The picker needs a real file URL, so the bytes land in the caches
            // directory first — the app's own container, no entitlement needed.
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(file.filename)
            try file.data.write(to: url)
            Self.presentSharingPicker(for: url)
            return nil
        }
    }

    func sendToTelegram(song: SongDetail, key: String, services: AppServices) async {
        showsTelegramLink = false
        await run {
            switch try await services.export.pushSongToTelegram(songID: song.id, key: key) {
            case .sent:
                return "Sent to Telegram."
            case .notLinked:
                self.showsTelegramLink = true
                throw ExportError.failed("Link your Telegram account first, then try again.")
            }
        }
    }

    /// Shared busy/status handling so each action reads as just its own work.
    private func run(_ work: () async throws -> String?) async {
        isBusy = true
        statusText = nil
        statusIsError = false
        do {
            if let message = try await work() {
                statusText = message
                statusIsError = false
            }
        } catch {
            statusText = (error as? LocalizedError)?.errorDescription ?? "\(error)"
            statusIsError = true
        }
        isBusy = false
    }

    private static func promptForDestination(filename: String) async -> URL? {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = filename
        panel.canCreateDirectories = true
        if let type = UTType(filenameExtension: (filename as NSString).pathExtension) {
            panel.allowedContentTypes = [type]
        }
        return await panel.begin() == .OK ? panel.url : nil
    }

    private static func presentSharingPicker(for url: URL) {
        guard let view = NSApp.keyWindow?.contentView else { return }
        let picker = NSSharingServicePicker(items: [url])
        picker.show(relativeTo: .zero, of: view, preferredEdge: .minY)
    }
}
