//
//  SongForm.swift
//  GraceChords Studio
//
//  The editor's working state for one song.
//
//  Swift mirror of `SongForm` / `validateSongForm` / `BLANK_SONG_FORM` in
//  packages/core/src/songs/songAuthoring.ts, deliberately hand-written rather than
//  bridged: the bridge passes primitives across a JSON boundary, so validating
//  through it would mean serialising the whole form on every keystroke to get three
//  booleans back. What IS bridged is everything whose *output* has to match another
//  client byte for byte — the parser, the transposer, the linter, `slugify`, and
//  the role hierarchy (see Core/CoreBridge.swift).
//
//  The validation rules are core's exactly: title, key, and at least one tag. If
//  core's rules change, this must follow — a song Studio accepts and the web
//  editor rejects is the failure mode to avoid.
//
//  TIME_SIGNATURES and LANGUAGE_OPTIONS are core's lists verbatim, for the same
//  reason: they populate pickers whose values land in shared columns.
//

import Foundation

struct SongForm: Equatable {
    var title = ""
    var artist = ""
    var defaultKey = ""
    /// Held as text, not Int, so the field can be empty and a half-typed number
    /// does not snap back while the user is typing.
    var tempo = ""
    var timeSignature = ""
    var country = ""
    var youtubeID = ""
    var language = ""
    var pptxURL = ""
    var tags: [String] = []
    var chordproContent = ""

    /// Core's `TIME_SIGNATURES`.
    static let timeSignatures = ["4/4", "3/4", "2/4", "6/8"]
    /// Core's `LANGUAGE_OPTIONS`, minus its leading '' — an empty selection is
    /// modelled by the picker's own "None" tag instead.
    static let languages = ["English", "Turkish", "Spanish", "Arabic", "Korean", "Other"]
    /// The keys the picker offers, matching the chart's letter spellings.
    static let keys = [
        "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb",
        "G", "G#", "Ab", "A", "A#", "Bb", "B",
    ]

    var tempoValue: Int? {
        let trimmed = tempo.trimmed
        guard !trimmed.isEmpty, let value = Int(trimmed), value > 0 else { return nil }
        return value
    }

    // MARK: - Validation (port of core's validateSongForm)

    struct Errors: Equatable {
        var title: String?
        var defaultKey: String?
        var tags: String?

        var isEmpty: Bool { title == nil && defaultKey == nil && tags == nil }
    }

    var errors: Errors {
        var errors = Errors()
        if title.trimmed.isEmpty { errors.title = "Title is required" }
        if defaultKey.isEmpty { errors.defaultKey = "Key is required" }
        if tags.isEmpty { errors.tags = "At least one tag is required" }
        return errors
    }

    /// Complete enough to publish — core's `validateSongForm` exactly, so Studio and
    /// the web editor accept the same songs into the public catalog.
    var isPublishable: Bool { errors.isEmpty }

    /// Complete enough to SAVE, which is a lower bar than publishing on purpose.
    ///
    /// Gating Save on the full rule made 13 songs already in the catalog uneditable:
    /// 8 published rows have no tags and 5 have no key, so an editor opening one to
    /// fix a typo would have had to invent a tag before the Save button would even
    /// enable. A draft is also allowed to be incomplete — that is most of what makes
    /// it a draft.
    ///
    /// Title is the one field that cannot be deferred: `songs.title` is NOT NULL, and
    /// the slug for a new row is derived from it.
    var isSavable: Bool { !title.trimmed.isEmpty }

    // MARK: - Mapping

    /// Port of core's `songRowToForm`.
    init(row: SongEditable) {
        self.title = row.title
        self.artist = row.artist ?? ""
        self.defaultKey = row.defaultKey ?? ""
        self.tempo = row.tempo.map(String.init) ?? ""
        self.timeSignature = row.timeSignature ?? ""
        self.country = row.country ?? ""
        self.youtubeID = row.youtubeID ?? ""
        self.language = row.language ?? ""
        self.pptxURL = row.pptxURL ?? ""
        self.tags = row.tags ?? []
        self.chordproContent = row.chordproContent ?? ""
    }

    /// A blank draft — core's `BLANK_SONG_FORM`.
    init() {}

    // MARK: - Tags

    /// Add a tag, snapping to the catalog's existing spelling when one matches
    /// case-insensitively.
    ///
    /// `songs.tags` is matched case-SENSITIVELY by the library's tag filter and by
    /// the web app's tag pages, and the live catalog is Title Case ("Slow",
    /// "Praise", "Worship"). So neither passing the input through nor forcing a case
    /// is right on its own: typing "worship" must not mint a second tag alongside
    /// "Worship" and split the filter, but a genuinely new tag has to keep the
    /// casing the user chose. Hence snap-if-known, keep-as-typed otherwise.
    ///
    /// Pass `knownTags` from `LibraryViewModel.availableTags`. With none supplied the
    /// input is kept verbatim, which is the safe direction — a tag that duplicates an
    /// existing one by case is fixable, a silently rewritten one is not.
    mutating func addTag(_ raw: String, knownTags: [String] = []) {
        let typed = raw.trimmed
        guard !typed.isEmpty else { return }
        let tag = knownTags.first { $0.caseInsensitiveCompare(typed) == .orderedSame } ?? typed
        guard !tags.contains(where: { $0.caseInsensitiveCompare(tag) == .orderedSame }) else { return }
        tags.append(tag)
    }

    mutating func removeTag(_ tag: String) {
        tags.removeAll { $0 == tag }
    }

    // MARK: - YouTube

    /// Port of core's `normalizeYoutubeInput`: a full URL or a bare id in, an
    /// 11-character video id out. `valid` is false when the text looks like neither,
    /// which the field shows as a warning without blocking the save — core does the
    /// same, because a wrong id is recoverable and a blocked save is not.
    static func normalizeYouTube(_ raw: String) -> (id: String, valid: Bool) {
        let trimmed = raw.trimmed
        guard !trimmed.isEmpty else { return ("", true) }
        if trimmed.range(of: "^[a-zA-Z0-9_-]{11}$", options: .regularExpression) != nil {
            return (trimmed, true)
        }
        for pattern in [#"[?&]v=([a-zA-Z0-9_-]{11})"#, #"youtu\.be/([a-zA-Z0-9_-]{11})"#, #"shorts/([a-zA-Z0-9_-]{11})"#] {
            if let range = trimmed.range(of: pattern, options: .regularExpression) {
                let match = String(trimmed[range])
                let id = String(match.suffix(11))
                return (id, true)
            }
        }
        return (trimmed, false)
    }
}
