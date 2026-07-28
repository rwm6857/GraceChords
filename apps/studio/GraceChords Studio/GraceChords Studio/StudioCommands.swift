//
//  StudioCommands.swift
//  GraceChords Studio
//
//  Menu-bar commands. A Mac app is expected to expose its verbs in the menu bar —
//  discoverable, keyboard-navigable, scriptable — not only on a toolbar button.
//
//  Export lands in File after Save, where a Mac user looks for it. Appearance lands
//  in View, since it changes how the app looks rather than what it contains.
//
//  Both are `Commands` types rather than `View`s dropped into a `CommandGroup`,
//  because `@FocusedObject` only tracks the active scene when read from a Commands
//  body. `@FocusedObject` rather than `@FocusedValue` for the same reason the enabled
//  state kept sticking: FocusedValue hands over the object but does not observe it,
//  so the menu is built once while the song is still loading and never re-evaluated.
//

import SwiftUI

/// File ▸ Export as… / Share… / Send to Telegram, acting on the frontmost song.
struct ExportCommands: Commands {
    @FocusedObject private var controller: ExportController?

    /// Every item needs the same three things — an open song, a configured API base,
    /// and no export already running — so they enable and disable together.
    private var isEnabled: Bool {
        guard let controller = controller else { return false }
        return controller.isAvailable && !controller.isBusy
    }

    var body: some Commands {
        CommandGroup(after: .saveItem) {
            Group {
                Button("Export as PDF…") { controller?.save(.pdf) }
                    .keyboardShortcut("e", modifiers: [.command])
                Button("Export as JPG…") { controller?.save(.jpg) }
                    .keyboardShortcut("e", modifiers: [.command, .shift])

                Divider()

                Button("Share…") { controller?.share() }
                Button("Send to Telegram") { controller?.sendToTelegram() }
            }
            .disabled(!isEnabled)

            Divider()
        }
    }
}

/// View ▸ Appearance ▸ System / Light / Dark.
struct AppearanceCommands: Commands {
    @ObservedObject var defaults: StudioDefaults

    var body: some Commands {
        // `.toolbar` is the View menu's own group, so this lands there rather than in
        // a menu of its own. A Picker in a menu renders as a native checkmarked
        // group, which is the right affordance for three exclusive choices.
        CommandGroup(after: .toolbar) {
            Picker("Appearance", selection: $defaults.theme) {
                ForEach(ThemePreference.allCases) { preference in
                    Text(preference.label).tag(preference)
                }
            }

            Divider()
        }
    }
}
