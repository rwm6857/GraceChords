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

struct SongForm: Equatable, Sendable {
    var title = ""
    var artist = ""
    var defaultKey = ""
    /// Held as text, not Int, so the field can be empty and a half-typed number
    /// does not snap back while the user is typing. Non-digits are rejected as they
    /// are typed — see `sanitizedTempo`.
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

    // MARK: - Keys

    /// Whether a key is written with sharps or flats. Not song data — it only
    /// decides which spellings the picker offers, since Eb and D# are the same key
    /// and a musician thinks in one or the other.
    enum Accidental: String, CaseIterable, Identifiable {
        case sharp, flat
        var id: String { rawValue }
        var symbol: String { self == .sharp ? "♯" : "♭" }
    }

    /// Majors, chromatic from C, in the requested spelling.
    static func majorKeys(_ accidental: Accidental) -> [String] {
        accidental == .sharp
            ? ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            : ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    }

    /// Minors, chromatic from A — the relative-minor order a musician scans.
    static func minorKeys(_ accidental: Accidental) -> [String] {
        accidental == .sharp
            ? ["Am", "A#m", "Bm", "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m"]
            : ["Am", "Bbm", "Bm", "Cm", "Dbm", "Dm", "Ebm", "Em", "Fm", "Gbm", "Gm", "Abm"]
    }

    /// The accidental a key is already written in, so opening a song in Eb does not
    /// show a picker full of sharps with nothing selected.
    static func accidental(of key: String) -> Accidental {
        key.contains("b") && key != "B" && !key.hasPrefix("Bm") ? .flat : .sharp
    }

    /// The same key spelled the other way, so flipping the toggle keeps the current
    /// selection rather than clearing it. Nil when there is no equivalent (a natural
    /// key is spelled identically in both).
    static func respelled(_ key: String, as accidental: Accidental) -> String? {
        guard !key.isEmpty else { return nil }
        let isMinor = key.hasSuffix("m")
        let from = isMinor ? minorKeys(accidental == .sharp ? .flat : .sharp) : majorKeys(accidental == .sharp ? .flat : .sharp)
        let to = isMinor ? minorKeys(accidental) : majorKeys(accidental)
        guard let index = from.firstIndex(of: key) else { return nil }
        return to[index]
    }

    // MARK: - Tempo

    var tempoValue: Int? {
        let trimmed = tempo.trimmed
        guard !trimmed.isEmpty, let value = Int(trimmed), value > 0 else { return nil }
        return value
    }

    /// Digits only, capped at four characters. Applied as the user types so a tempo
    /// field cannot hold "abc" and silently save nothing — the alternative (accept
    /// anything, drop it at save) loses input without saying so.
    static func sanitizedTempo(_ raw: String) -> String {
        String(raw.filter(\.isNumber).prefix(4))
    }

    // MARK: - Validation (port of core's validateSongForm)

    struct Errors: Equatable {
        var title: String?
        var defaultKey: String?
        var tags: String?

        var isEmpty: Bool { title == nil && defaultKey == nil && tags == nil }
    }

    /// Terse on purpose. The field label already names the field and the asterisk's
    /// colour already says whether it blocks saving or only publishing, so spelling
    /// out "Key is required to publish" beneath a narrow field just wrapped onto two
    /// lines and said the same thing three times.
    var errors: Errors {
        var errors = Errors()
        if title.trimmed.isEmpty { errors.title = "Required" }
        if defaultKey.isEmpty { errors.defaultKey = "Required" }
        if tags.isEmpty { errors.tags = "Required" }
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

    /// What is still missing before this song could go live, for the one summary the
    /// editor shows instead of repeating itself per field.
    var missingForPublish: [String] {
        var missing: [String] = []
        if errors.title != nil { missing.append("title") }
        if errors.defaultKey != nil { missing.append("key") }
        if errors.tags != nil { missing.append("a tag") }
        return missing
    }

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
    @discardableResult
    mutating func addTag(_ raw: String, knownTags: [String] = []) -> Bool {
        let typed = raw.trimmed
        guard !typed.isEmpty else { return false }
        let tag = knownTags.first { $0.caseInsensitiveCompare(typed) == .orderedSame } ?? typed
        guard !tags.contains(where: { $0.caseInsensitiveCompare(tag) == .orderedSame }) else { return false }
        tags.append(tag)
        return true
    }

    /// Add every tag in a comma-separated string. Pasting "Slow, Praise, Hymn"
    /// should land three tags, not one tag with commas in it.
    mutating func addTags(commaSeparated raw: String, knownTags: [String] = []) {
        for piece in raw.split(separator: ",") {
            addTag(String(piece), knownTags: knownTags)
        }
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
                return (String(match.suffix(11)), true)
            }
        }
        return (trimmed, false)
    }
}

// MARK: - Draft persistence

/// `Codable` so `DraftStore` can keep unsaved work across a quit.
///
/// The decoder is deliberately lenient — every field is `decodeIfPresent` onto the
/// blank form's default. A draft written by an older build is missing whatever field
/// has been added since, and the useful answer there is "restore the eleven fields it
/// does have and leave the twelfth blank", not "throw the user's unsaved song away
/// because the schema moved". Removing or repurposing a field is the case that
/// genuinely changes meaning; that is what `SongDraftSnapshot.version` is for.
extension SongForm: Codable {
    enum CodingKeys: String, CodingKey {
        case title, artist, defaultKey, tempo, timeSignature
        case country, youtubeID, language, pptxURL, tags, chordproContent
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        func string(_ key: CodingKeys) throws -> String {
            try container.decodeIfPresent(String.self, forKey: key) ?? ""
        }
        self.init()
        title = try string(.title)
        artist = try string(.artist)
        defaultKey = try string(.defaultKey)
        tempo = try string(.tempo)
        timeSignature = try string(.timeSignature)
        country = try string(.country)
        youtubeID = try string(.youtubeID)
        language = try string(.language)
        pptxURL = try string(.pptxURL)
        tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        chordproContent = try string(.chordproContent)
    }
}
