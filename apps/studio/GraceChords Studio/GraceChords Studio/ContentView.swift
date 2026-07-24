//
//  ContentView.swift
//  GraceChords Studio
//
//  Created by Ryan Moore on 7/24/26.
//
//  App shell: config check → session check → library + viewer.
//

import SwiftUI

struct ContentView: View {
    // `static let` so the Supabase client and the JavaScriptCore context are built
    // once, not on every view re-init.
    private static let services: Result<AppServices, StudioConfig.ConfigError> =
        StudioConfig.resolve().map(AppServices.init(config:))

    var body: some View {
        switch Self.services {
        case .success(let services):
            SignedInGate(services: services)
        case .failure(let error):
            ConfigErrorView(message: error.errorDescription ?? "Studio is not configured.")
        }
    }
}

/// Shows the sign-in screen until there is a session, then the library.
private struct SignedInGate: View {
    let services: AppServices

    @StateObject private var auth: AuthController
    @StateObject private var library: LibraryViewModel

    init(services: AppServices) {
        self.services = services
        _auth = StateObject(wrappedValue: AuthController(client: services.client))
        _library = StateObject(wrappedValue: LibraryViewModel(repository: services.songs))
    }

    var body: some View {
        Group {
            switch auth.phase {
            case .loading:
                ProgressView()
                    .frame(minWidth: 420, minHeight: 320)
            case .signedOut:
                SignInView(auth: auth)
            case .signedIn:
                LibrarySplitView(services: services, auth: auth, library: library)
            }
        }
        .task {
            // Restores the Keychain-persisted session, then follows auth state for
            // as long as the window lives.
            await auth.observeAuthState()
        }
    }
}

/// Sidebar library + detail viewer, collapsing to one pane in a narrow window.
///
/// macOS does not collapse a NavigationSplitView the way iPadOS does, and
/// NavigationSplitViewVisibility has no "sidebar only" case — `.all` in a narrow
/// window just squeezes both columns. So below the threshold the sidebar is hidden
/// (`.detailOnly`) and the detail column shows either the library or the viewer,
/// with a manual back button. One view hierarchy either way, so crossing the
/// threshold never resets scroll position, search text, or selection (all of which
/// live in LibraryViewModel).
private struct LibrarySplitView: View {
    let services: AppServices
    @ObservedObject var auth: AuthController
    @ObservedObject var library: LibraryViewModel

    /// Sidebar (280) + a viewer column wide enough for a chart line (~440).
    private static let narrowThreshold: CGFloat = 720

    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var isNarrow = false

    var body: some View {
        GeometryReader { geometry in
            NavigationSplitView(columnVisibility: $columnVisibility) {
                SongLibraryView(model: library)
                    .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 360)
            } detail: {
                detail
            }
            .navigationSplitViewStyle(.balanced)
            // Attached to the split view, not to the GeometryReader around it, so
            // the items reach the window toolbar.
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        if let email = auth.signedInEmail {
                            Text(email)
                        }
                        Button("Reload Library") { Task { await library.load() } }
                        Divider()
                        Button("Sign Out") { Task { await auth.signOut() } }
                    } label: {
                        Label("Account", systemImage: "person.crop.circle")
                    }
                }
            }
            .onAppear { applyLayout(for: geometry.size.width) }
            .onChange(of: geometry.size.width) { _, width in applyLayout(for: width) }
        }
        .frame(minWidth: 480, minHeight: 400)
        .task { await library.loadIfNeeded() }
        .onChange(of: library.sessionExpired) { _, expired in
            if expired { auth.sessionExpired() }
        }
    }

    @ViewBuilder
    private var detail: some View {
        if isNarrow, library.selectedSlug == nil {
            // Narrow + nothing selected: the library IS the single pane.
            SongLibraryView(model: library)
        } else if let slug = library.selectedSlug {
            SongViewerView(
                slug: slug,
                services: services,
                showsBackButton: isNarrow,
                onBack: { library.selectedSlug = nil },
                onSessionExpired: { auth.sessionExpired() }
            )
            .id(slug)
        } else {
            Text("Select a song")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func applyLayout(for width: CGFloat) {
        let narrow = width < Self.narrowThreshold
        guard narrow != isNarrow else { return }
        isNarrow = narrow
        columnVisibility = narrow ? .detailOnly : .all
    }
}

private struct ConfigErrorView: View {
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Studio is not configured", systemImage: "exclamationmark.triangle")
                .font(.headline)
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(28)
        .frame(minWidth: 520, minHeight: 300, alignment: .topLeading)
    }
}

#Preview {
    ContentView()
}
