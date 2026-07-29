//
//  ShellNavigation.swift
//  GraceChords Studio
//
//  Which top-level section the signed-in app is showing.
//
//  An observable rather than `@State` inside the shell so the menu bar can reach it:
//  `@FocusedObject` needs a reference type, and View ▸ Library / Manage Songs cannot
//  see a view's private state. See StudioCommands.swift.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY, under which `ObservableObject` and
// `@Published` are not visible through a transitive import of SwiftUI.
import Combine
import Foundation

@MainActor
final class ShellNavigation: ObservableObject {
    enum Section: String, Hashable, CaseIterable, Identifiable {
        case library = "Library"
        case manage = "Manage"

        var id: String { rawValue }

        var symbol: String {
            switch self {
            case .library: return "music.note.list"
            case .manage: return "square.and.pencil"
            }
        }
    }

    @Published var section: Section = .library

    /// Whether the Manage section exists for this account at all, so the View menu can
    /// disable its item rather than offering a section that would bounce straight back.
    /// Mirrored from the shell's role check so the menu and the toolbar agree.
    @Published var canManage = false
}
