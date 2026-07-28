//
//  KeepScreenAwake.swift
//  GraceChords Studio
//
//  "Keep screen awake" while a chart is on screen — the macOS counterpart of
//  apps/mobile/src/lib/keepAwake.ts, which engages expo-keep-awake only while the
//  Viewer is focused.
//
//  Uses ProcessInfo's activity API rather than a raw IOPMAssertion: it is the
//  supported AppKit-era mechanism, it is scoped to a token whose lifetime we
//  control, and the system reclaims it if the process dies — so a crash cannot
//  leave the user's display permanently awake.
//
//  Scoped to the view's lifetime and to the flag, so the assertion is never held
//  in the background or after the preference is turned off.
//

import Foundation
import SwiftUI

extension View {
    /// Hold off display sleep while this view is on screen and `enabled` is true.
    func keepScreenAwake(_ enabled: Bool) -> some View {
        modifier(KeepScreenAwakeModifier(enabled: enabled))
    }
}

private struct KeepScreenAwakeModifier: ViewModifier {
    let enabled: Bool

    @State private var assertion = DisplaySleepAssertion()

    func body(content: Content) -> some View {
        content
            .onAppear { assertion.setEnabled(enabled) }
            .onChange(of: enabled) { _, isEnabled in assertion.setEnabled(isEnabled) }
            .onDisappear { assertion.setEnabled(false) }
    }
}

/// Holds at most one activity token. A class so `@State` keeps the same instance
/// across body re-evaluations, and so `deinit` is a backstop for the case where
/// `onDisappear` never runs.
private final class DisplaySleepAssertion {
    private var token: NSObjectProtocol?

    func setEnabled(_ enabled: Bool) {
        guard enabled != (token != nil) else { return }
        if enabled {
            token = ProcessInfo.processInfo.beginActivity(
                options: [.idleDisplaySleepDisabled],
                reason: "Displaying a chord chart"
            )
        } else if let token = token {
            ProcessInfo.processInfo.endActivity(token)
            self.token = nil
        }
    }

    deinit {
        if let token = token { ProcessInfo.processInfo.endActivity(token) }
    }
}
