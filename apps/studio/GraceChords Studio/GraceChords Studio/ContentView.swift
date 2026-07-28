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
                StudioShell(services: services, auth: auth, library: library)
            }
        }
        .task {
            // Restores the Keychain-persisted session, then follows auth state for
            // as long as the window lives.
            await auth.observeAuthState()
        }
    }
}

/// The signed-in app: a section picker plus the selected section's own split view.
///
/// The Manage section is revealed by role rather than always present-but-disabled.
/// A disabled tab advertises a capability the account does not have and invites the
/// user to go looking for why, where an absent one simply is not part of their app —
/// which is how apps/web's portal behaves for the same roles.
///
/// The gate is a courtesy, not the security boundary. Every write is independently
/// enforced by the `songs_insert` / `songs_update` / `songs_delete` policies, so a
/// user who forced this open would gain a UI, not permissions.
private struct StudioShell: View {
    let services: AppServices
    @ObservedObject var auth: AuthController
    @ObservedObject var library: LibraryViewModel

    private enum Section: String, Hashable, CaseIterable {
        case library = "Library"
        case manage = "Manage"

        var symbol: String {
            switch self {
            case .library: return "music.note.list"
            case .manage: return "square.and.pencil"
            }
        }
    }

    @State private var section: Section = .library

    /// editor+ per packages/core's `canDirectWrite`, answered through the bridged
    /// `hasMinRole` rather than a Swift copy of the hierarchy.
    ///
    /// A bridge that failed to load yields false, so the Manage section stays hidden
    /// — fail closed. That is also the honest answer: without the bridge there is no
    /// parser, so the editor would have no preview and no slug generation anyway.
    private var canManage: Bool {
        guard let bridge = services.bridge else { return false }
        return (try? bridge.hasMinRole(auth.role, atLeast: "editor")) ?? false
    }

    var body: some View {
        Group {
            switch section {
            case .library:
                LibrarySplitView(services: services, auth: auth, library: library)
            case .manage:
                ManageSongsView(
                    services: services,
                    library: library,
                    onSessionExpired: { auth.sessionExpired() }
                )
            }
        }
        .toolbar {
            if canManage {
                ToolbarItem(placement: .navigation) {
                    Picker("Section", selection: $section) {
                        ForEach(Section.allCases, id: \.self) { section in
                            Label(section.rawValue, systemImage: section.symbol).tag(section)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .help("Switch between reading the library and editing songs")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    if let email = auth.signedInEmail {
                        Text(email)
                    }
                    if auth.role != "user" {
                        Text("Role: \(auth.role)")
                    }
                    Button("Reload Library") { Task { await library.load() } }
                    Divider()
                    Button("Sign Out") { Task { await auth.signOut() } }
                } label: {
                    Label("Account", systemImage: "person.crop.circle")
                }
            }
        }
        // A role that drops below editor mid-session (or a bridge that never loaded)
        // must not leave the user sitting in a section that no longer exists.
        .onChange(of: canManage) { _, allowed in
            if !allowed, section == .manage { section = .library }
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
            // The Account menu and the section picker live on StudioShell, which
            // wraps both sections — otherwise each section would install its own and
            // they would appear and disappear as the user switched.
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
                .gcTextStyle(.body)
                .foregroundStyle(GCColor.sec)
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
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            Label {
                Text("Studio is not configured")
                    .gcTextStyle(.rowTitle)
                    .foregroundStyle(GCColor.ink)
            } icon: {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(GCColor.danger)
            }
            Text(message)
                .gcTextStyle(.body)
                .foregroundStyle(GCColor.sec)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(GCSpacing.xl)
        .frame(minWidth: 520, minHeight: 300, alignment: .topLeading)
    }
}

#Preview {
    ContentView()
}
