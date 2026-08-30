//
//  DraftStoreTests.swift
//  GraceChords StudioTests
//
//  The draft store's whole job is to hand back exactly what was typed, or nothing.
//  "Nothing" is a fine answer; a partially understood form is not, because it would
//  put fields the writer never typed into a song they are about to publish.
//

import Foundation
import Testing
@testable import GraceChords_Studio

@Suite("Draft store")
struct DraftStoreTests {
    /// A store in its own temporary directory, so the tests never touch the real
    /// container and delete somebody's recovered work.
    static func temporaryStore() -> DraftStore {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("gc-draft-tests-\(UUID().uuidString)", isDirectory: true)
        return DraftStore(directory: directory)
    }

    static func sampleForm() -> SongForm {
        var form = SongForm()
        form.title = "Great Is Thy Faithfulness"
        form.defaultKey = "G"
        form.tags = ["Worship", "Slow"]
        form.chordproContent = "{start_of_verse}\n[G]Great is Thy [C]faithfulness\n{end_of_verse}"
        return form
    }

    @Test("a draft round-trips")
    func roundTrip() {
        let store = Self.temporaryStore()
        let form = Self.sampleForm()
        store.write(SongDraftSnapshot(key: "new", form: form, savedAt: Date(timeIntervalSince1970: 1_700_000_000)))

        let read = store.read(key: "new")
        #expect(read?.form == form)
        #expect(read?.key == "new")
        #expect(read?.savedAt == Date(timeIntervalSince1970: 1_700_000_000))
    }

    @Test("an absent draft reads as nil rather than as a blank form")
    func absent() {
        #expect(Self.temporaryStore().read(key: "nothing-here") == nil)
    }

    @Test("clearing removes it")
    func clear() {
        let store = Self.temporaryStore()
        store.write(SongDraftSnapshot(key: "abc", form: Self.sampleForm(), savedAt: Date()))
        store.clear(key: "abc")
        #expect(store.read(key: "abc") == nil)
    }

    @Test("two songs do not share a slot")
    func separateKeys() {
        let store = Self.temporaryStore()
        var one = SongForm(); one.title = "One"
        var two = SongForm(); two.title = "Two"
        store.write(SongDraftSnapshot(key: "song-one", form: one, savedAt: Date()))
        store.write(SongDraftSnapshot(key: "song-two", form: two, savedAt: Date()))
        #expect(store.read(key: "song-one")?.form.title == "One")
        #expect(store.read(key: "song-two")?.form.title == "Two")
    }

    @Test("a corrupt draft is dropped, not repaired")
    func corrupt() throws {
        let store = Self.temporaryStore()
        let url = try #require(store.fileURL(for: "broken"))
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        try Data("{ this is not json".utf8).write(to: url)

        #expect(store.read(key: "broken") == nil)
        // And removed, so it cannot fail again on every open.
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }

    @Test("a draft from a newer build is refused")
    func futureVersion() throws {
        let store = Self.temporaryStore()
        let url = try #require(store.fileURL(for: "future"))
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        var snapshot = SongDraftSnapshot(key: "future", form: Self.sampleForm(), savedAt: Date())
        snapshot.version = SongDraftSnapshot.currentVersion + 1
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(snapshot).write(to: url)

        #expect(store.read(key: "future") == nil)
    }

    @Test("a key cannot walk out of the drafts directory")
    func keySanitising() throws {
        let store = Self.temporaryStore()
        let url = try #require(store.fileURL(for: "../../escape"))
        #expect(!url.path.contains(".."))
        #expect(url.deletingLastPathComponent().path == store.directory.path)
        // A key with nothing usable in it is refused outright.
        #expect(store.fileURL(for: "../..") == nil)
        #expect(store.fileURL(for: "") == nil)
    }

    @Test("a draft written before a field existed still restores the rest")
    func lenientDecoding() throws {
        // SongForm's decoder fills absent fields with their blank values, so adding a
        // field to the form does not throw away everyone's unsaved work.
        let json = """
        {"version":1,"key":"new","savedAt":"2026-01-01T00:00:00Z",
         "form":{"title":"Partial","chordproContent":"[G]hi"}}
        """
        let store = Self.temporaryStore()
        let url = try #require(store.fileURL(for: "new"))
        try FileManager.default.createDirectory(at: store.directory, withIntermediateDirectories: true)
        try Data(json.utf8).write(to: url)

        let read = try #require(store.read(key: "new"))
        #expect(read.form.title == "Partial")
        #expect(read.form.chordproContent == "[G]hi")
        #expect(read.form.artist.isEmpty)
        #expect(read.form.tags.isEmpty)
    }
}
