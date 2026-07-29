//
//  EditorSession.swift
//  GraceChords Studio
//
//  What is open in the editor, held above both the Manage section and the app shell.
//
//  It lives here rather than as `@State` inside ManageSongsView because two different
//  places have to be able to ask "would leaving now lose work?": the sidebar, when a
//  different song is clicked, and the shell, when the section picker or a menu command
//  switches away from Manage. With the model private to the Manage view, switching to
//  Library silently discarded unsaved edits — there was nothing for the shell to ask.
//
//  It also gives the menu-bar commands something to act on: `@FocusedObject` needs a
//  reference type, and `SongEditorModel` reaches the File menu through this.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import Foundation

@MainActor
final class EditorSession: ObservableObject {
    /// Which song the editor is on. `.new` is an unsaved blank draft with no row yet.
    enum Target: Hashable {
        case new
        case existing(id: String)

        var id: String {
            switch self {
            case .new: return "new"
            case .existing(let id): return id
            }
        }
    }

    @Published private(set) var target: Target?
    @Published private(set) var editor: SongEditorModel?

    /// True when closing or navigating away would lose typing.
    var hasUnsavedChanges: Bool { editor?.isDirty ?? false }

    /// Start a new song, going through the Manage section's unsaved-changes guard.
    /// Set by that section so File ▸ New Song reaches the same path the toolbar does
    /// instead of a second, unguarded one.
    var requestNew: (() -> Void)?

    func open(_ target: Target, model: SongEditorModel) {
        self.target = target
        self.editor = model
    }

    /// Re-point at a real row without rebuilding the model — used after a new draft's
    /// first save, so the sidebar can select it while the user keeps typing in the
    /// editor they already have open.
    func retarget(to target: Target) {
        self.target = target
    }

    func close() {
        target = nil
        editor = nil
    }
}
