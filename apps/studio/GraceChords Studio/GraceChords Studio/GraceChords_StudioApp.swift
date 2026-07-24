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
        }
        // Opens wide enough for the split view to show both panes; drag narrower
        // than 720pt to exercise the single-pane layout.
        .defaultSize(width: 1100, height: 760)
    }
}
