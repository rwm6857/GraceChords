//
//  GraceChords_StudioApp.swift
//  GraceChords Studio
//
//  Created by Ryan Moore on 7/24/26.
//

import SwiftUI

@main
struct GraceChords_StudioApp: App {
    @StateObject private var defaults = StudioDefaults.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                // The brand accent, set once at the root so buttons, list
                // selection, and focus rings all read as Signal blue. The
                // AccentColor asset — generated from the same tokens — covers the
                // AppKit chrome the SwiftUI environment does not reach.
                .tint(GCColor.accent)
                // The appearance override. Declarative, so it applies at launch as
                // well as when the View menu changes it.
                .preferredColorScheme(defaults.theme.colorScheme)
        }
        // Opens wide enough for the split view to show both panes; drag narrower
        // than 720pt to exercise the single-pane layout.
        .defaultSize(width: 1100, height: 760)
        .commands {
            ExportCommands()
            NavigationCommands()
            EditorCommands()
            AppearanceCommands(defaults: defaults)
        }
    }
}
