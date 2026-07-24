//
//  ContentView.swift
//  GraceChords Studio
//
//  Created by Ryan Moore on 7/24/26.
//
//  Plumbing spike only: runs the CoreBridge self-check once and prints the
//  round-trip results. No design work here — this view is expected to be replaced
//  wholesale by the real Studio UI.
//

import SwiftUI

struct ContentView: View {
    // `static let` so the context is built once, not on every view re-init.
    private static let sharedReport = CoreBridgeSpike.run()
    private var report: SpikeReport { Self.sharedReport }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("packages/core → JavaScriptCore")
                    .font(.headline)
                Text(report.headline)
                    .font(.subheadline)
                    .foregroundStyle(report.allPassed ? .green : .red)

                Divider()

                ForEach(report.checks) { check in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(check.passed ? "✓" : "✗")
                            .foregroundStyle(check.passed ? .green : .red)
                        Text(check.text)
                            .textSelection(.enabled)
                    }
                    .font(.system(.body, design: .monospaced))
                }
            }
            .padding()
            .frame(minWidth: 520, alignment: .leading)
        }
    }
}

#Preview {
    ContentView()
}
