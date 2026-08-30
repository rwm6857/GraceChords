//
//  SongEditorDraftTests.swift
//  GraceChords StudioTests
//
//  The draft store's own round trip is covered in DraftStoreTests. This is the wiring
//  around it — the part that decides *when* to write, when to restore, and when to
//  delete — which is where a recovery feature goes wrong: a draft that is never
//  written, or one that comes back after the user discarded it.
//
//  The model is built against a real `AppServices` with placeholder credentials.
//  Nothing here touches the network: `SupabaseClient`'s initializer makes no request,
//  and every test stays on the paths that do not call the repository. It does load
//  the real JavaScriptCore bundle, which is deliberate — the lint wiring is only
//  worth testing against the linter it will actually run.
//

import Foundation
import Testing
@testable import GraceChords_Studio

@Suite("Editor draft recovery")
struct SongEditorDraftTests {
    static func services() -> AppServices {
        AppServices(config: StudioConfig(
            supabaseURL: URL(string: "https://placeholder.supabase.co")!,
            supabaseAnonKey: "placeholder-anon-key",
            apiBaseURL: nil
        ))
    }

    static func temporaryStore() -> DraftStore {
        DraftStore(directory: URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("gc-editor-tests-\(UUID().uuidString)", isDirectory: true))
    }

    /// Wait for the debounced, detached write to land — or give up, so a failure
    /// reports as "no draft was written" rather than hanging the suite.
    static func waitForDraft(in store: DraftStore, key: String, toExist: Bool) async -> SongDraftSnapshot? {
        for _ in 0..<40 {
            let snapshot = store.read(key: key)
            if (snapshot != nil) == toExist { return snapshot }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return store.read(key: key)
    }

    @Test("typing writes a draft, and reverting deletes it")
    func writesAndClears() async {
        let store = Self.temporaryStore()
        let model = SongEditorModel(services: Self.services(), drafts: store)

        model.form.title = "Great Is Thy Faithfulness"
        model.form.chordproContent = "[G]Great is Thy faithfulness"
        let written = await Self.waitForDraft(in: store, key: "new", toExist: true)
        #expect(written?.form.title == "Great Is Thy Faithfulness")

        // Back to the saved state — which for a new song is blank. The draft should go
        // with it, so nothing is offered for recovery later.
        model.form = SongForm()
        let cleared = await Self.waitForDraft(in: store, key: "new", toExist: false)
        #expect(cleared == nil)
    }

    @Test("a new song's draft comes back, as unsaved work")
    func restoresNewDraft() async {
        let store = Self.temporaryStore()
        var form = SongForm()
        form.title = "Recovered"
        form.chordproContent = "[C]Was never saved"
        store.write(SongDraftSnapshot(key: "new", form: form, savedAt: Date(timeIntervalSince1970: 1_700_000_000)))

        let model = SongEditorModel(services: Self.services(), drafts: store)
        await model.load()

        #expect(model.form.title == "Recovered")
        #expect(model.restoredDraftAt == Date(timeIntervalSince1970: 1_700_000_000))
        // The point of restoring into `form` and not `savedForm`: it is unsaved work,
        // and the guard has to keep treating it that way.
        #expect(model.isDirty)
    }

    @Test("a draft matching what was loaded is dropped, not announced")
    func identicalDraftIsSilent() async {
        let store = Self.temporaryStore()
        // Blank, which is exactly what a new model's savedForm is.
        store.write(SongDraftSnapshot(key: "new", form: SongForm(), savedAt: Date()))

        let model = SongEditorModel(services: Self.services(), drafts: store)
        await model.load()

        #expect(model.restoredDraftAt == nil)
        #expect(!model.isDirty)
        #expect(store.read(key: "new") == nil)
    }

    @Test("discarding recovered work reverts the form and removes the file")
    func discardReverts() async {
        let store = Self.temporaryStore()
        var form = SongForm()
        form.title = "Unwanted"
        store.write(SongDraftSnapshot(key: "new", form: form, savedAt: Date()))

        let model = SongEditorModel(services: Self.services(), drafts: store)
        await model.load()
        #expect(model.form.title == "Unwanted")

        model.discardRestoredDraft()
        #expect(model.form.title.isEmpty)
        #expect(model.restoredDraftAt == nil)
        _ = await Self.waitForDraft(in: store, key: "new", toExist: false)
        #expect(store.read(key: "new") == nil)
    }

    @Test("two editors do not share a draft slot")
    func separateSlots() async {
        let store = Self.temporaryStore()
        var existing = SongForm()
        existing.title = "Belongs to a song"
        store.write(SongDraftSnapshot(key: "song-123", form: existing, savedAt: Date()))

        // A blank new-song editor must not pick up the other song's draft.
        let model = SongEditorModel(services: Self.services(), drafts: store)
        await model.load()
        #expect(model.form.title.isEmpty)
        #expect(model.restoredDraftAt == nil)
        #expect(store.read(key: "song-123") != nil)
    }
}
