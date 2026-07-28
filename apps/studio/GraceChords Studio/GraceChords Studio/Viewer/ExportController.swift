//
//  ExportController.swift
//  GraceChords Studio
//
//  The export actions for whichever song is open, in one object so the toolbar menu
//  and the File menu drive the same code rather than each owning a copy.
//
//  The Viewer publishes it with `.focusedSceneObject`; the menu bar reads it back
//  with `@FocusedObject`. That is how a Mac app's menus reach the active window's
//  state, and it means File ▸ Export disables itself when no song is open.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import AppKit
import Combine
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class ExportController: ObservableObject {
    @Published private(set) var isBusy = false
    /// Set to surface an alert; the Viewer presents it.
    @Published var alert: ExportAlert?

    /// What the actions operate on. Updated by the Viewer as the song and key change.
    ///
    /// `@Published` matters here beyond bookkeeping: the menu bar reads `isAvailable`
    /// through `@FocusedObject`, and a plain stored property would leave File ▸ Export
    /// disabled forever — the menu is built once while the song is still loading, and
    /// nothing would tell it to look again.
    @Published private(set) var song: SongDetail?
    @Published private(set) var exportKey = ""
    private var services: AppServices?

    struct ExportAlert: Identifiable {
        let id = UUID()
        let title: String
        let message: String
        /// Shown for the "link your account first" case.
        var showsTelegramLink = false
    }

    /// Whether the actions can run at all: a song is open and the API base is set.
    var isAvailable: Bool { song != nil && (services?.export.isConfigured ?? false) }

    func update(song: SongDetail?, exportKey: String, services: AppServices) {
        self.song = song
        self.exportKey = exportKey
        self.services = services
    }

    // MARK: - Actions

    func save(_ format: ExportFormat) {
        run { services, song in
            let file = try await services.export.exportSong(
                songID: song.id, key: self.exportKey, format: format)
            // The save panel is what grants the sandbox write access to the chosen
            // location — nothing is written until the user picks one.
            guard let destination = await Self.promptForDestination(filename: file.filename) else {
                return nil
            }
            try file.data.write(to: destination)
            return nil
        }
    }

    func share(_ format: ExportFormat = .pdf) {
        run { services, song in
            let file = try await services.export.exportSong(
                songID: song.id, key: self.exportKey, format: format)
            // The picker needs a real file URL, so the bytes land in the app's own
            // temporary directory first — inside the container, no entitlement needed.
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(file.filename)
            try file.data.write(to: url)
            Self.presentSharingPicker(for: url)
            return nil
        }
    }

    func sendToTelegram() {
        run { services, song in
            switch try await services.export.pushSongToTelegram(songID: song.id, key: self.exportKey) {
            case .sent:
                return ExportAlert(title: "Sent to Telegram",
                                   message: "“\(song.title)” is on its way to your linked chat.")
            case .notLinked:
                return ExportAlert(
                    title: "Link Telegram first",
                    message: "Open the GraceChords bot in Telegram and link your account, then try again.",
                    showsTelegramLink: true
                )
            }
        }
    }

    /// Shared busy handling and error reporting, so each action is just its own work.
    /// Errors become an alert — the native way to report a failed command, and the
    /// only option once these run from the menu bar with no panel to write into.
    private func run(_ work: @escaping (AppServices, SongDetail) async throws -> ExportAlert?) {
        guard let services = services, let song = song, !isBusy else { return }
        isBusy = true
        Task {
            do {
                if let alert = try await work(services, song) { self.alert = alert }
            } catch {
                self.alert = ExportAlert(
                    title: "Export failed",
                    message: (error as? LocalizedError)?.errorDescription ?? "\(error)"
                )
            }
            self.isBusy = false
        }
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
