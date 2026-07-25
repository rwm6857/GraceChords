//
//  GraceChords_StudioApp.swift
//  GraceChords Studio
//
//  Created by Ryan Moore on 7/24/26.
//

import SwiftUI

@main
struct GraceChords_StudioApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                // The brand accent, set once at the root so buttons, list
                // selection, and focus rings all read as Signal blue. The
                // AccentColor asset — generated from the same tokens — covers the
                // AppKit chrome the SwiftUI environment does not reach.
                .tint(GCColor.accent)
        }
        // Opens wide enough for the split view to show both panes; drag narrower
        // than 720pt to exercise the single-pane layout.
        .defaultSize(width: 1100, height: 760)
    }
}
