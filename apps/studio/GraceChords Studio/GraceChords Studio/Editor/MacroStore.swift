//
//  MacroStore.swift
//  GraceChords Studio
//
//  User-defined ChordPro snippets, saved locally.
//
//  Distinct from the quick-chord and quick-section buttons, which insert things core
//  knows about. A macro is whatever *this* person types often and core cannot predict:
//  a house intro, a tag with a specific turnaround, a two-chord vamp, the chorus of a
//  song being arranged in several keys.
//
//  Local and per-user on purpose. These are personal shorthand, not catalog content —
//  putting them in Supabase would mean a schema, RLS, and a sync story for something
//  whose whole value is that it is instant and private. `UserDefaults` is the right
//  size of hammer; if they ever need to follow an account across machines, that is a
//  deliberate later change rather than something to pre-build.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import Foundation

struct SongMacro: Codable, Hashable, Identifiable {
    let id: UUID
    var name: String
    var body: String

    init(id: UUID = UUID(), name: String, body: String) {
        self.id = id
        self.name = name
        self.body = body
    }

    /// First line, trimmed, for the menu subtitle — enough to tell two macros apart
    /// without showing the whole block.
    var firstLine: String {
        body.components(separatedBy: .newlines)
            .first(where: { !$0.trimmed.isEmpty })?
            .trimmed ?? ""
    }
}

@MainActor
final class MacroStore: ObservableObject {
    static let shared = MacroStore()

    private static let key = "chordproMacros"

    @Published private(set) var macros: [SongMacro] = []

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    func add(name: String, body: String) {
        let trimmedName = name.trimmed
        let trimmedBody = body.trimmed
        guard !trimmedName.isEmpty, !trimmedBody.isEmpty else { return }
        // Same name replaces rather than duplicates: re-saving a macro after tweaking
        // it is the common case, and two identically named entries are unusable.
        if let index = macros.firstIndex(where: { $0.name.caseInsensitiveCompare(trimmedName) == .orderedSame }) {
            macros[index].body = trimmedBody
        } else {
            macros.append(SongMacro(name: trimmedName, body: trimmedBody))
        }
        persist()
    }

    func remove(_ macro: SongMacro) {
        macros.removeAll { $0.id == macro.id }
        persist()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.key) else { return }
        // A decode failure means the stored blob is from an incompatible shape. Losing
        // local shorthand is survivable; refusing to open the editor is not.
        macros = (try? JSONDecoder().decode([SongMacro].self, from: data)) ?? []
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(macros) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
