//
//  CoreBridge.swift
//  GraceChords Studio
//
//  Thin wrapper around a JavaScriptCore context running packages/core.
//
//  The context is loaded from Resources/GraceChordsCore.js — the flat IIFE built
//  by apps/studio/js/build-core-bundle.mjs, which assigns a GraceChordsCore
//  global. Only specific, typed functions are exposed here; there is deliberately
//  no general-purpose "evaluate this string" API.
//
//  Not thread-safe: a JSContext must not be used concurrently. Construct one
//  CoreBridge and call it from a single thread (Studio uses the main thread).
//

import Foundation
import JavaScriptCore

enum CoreBridgeError: Error, LocalizedError {
    /// GraceChordsCore.js was not found in the app bundle's Resources.
    case bundleMissing(searchedIn: String)
    case bundleUnreadable(path: String, reason: String)
    /// Evaluating the bundle threw.
    case evaluationFailed(String)
    /// The bundle evaluated but did not expose the expected global/function.
    case missingExport(String)
    /// JavaScript threw while the call was running.
    case jsException(String)
    /// The call returned something other than the expected type.
    case unexpectedResult(String)
    /// The JSON the bundle returned did not match the expected Swift model.
    case decodingFailed(type: String, reason: String)

    var errorDescription: String? {
        switch self {
        case .bundleMissing(let searchedIn):
            return """
            GraceChordsCore.js is not in the app bundle (searched \(searchedIn)). \
            Run `node "apps/studio/js/build-core-bundle.mjs"` and confirm the file \
            is in the target's Copy Bundle Resources phase.
            """
        case .bundleUnreadable(let path, let reason):
            return "Could not read \(path): \(reason)"
        case .evaluationFailed(let message):
            return "Loading the core bundle failed: \(message)"
        case .missingExport(let name):
            return "The core bundle did not export \(name)."
        case .jsException(let message):
            return "JavaScript error: \(message)"
        case .unexpectedResult(let message):
            return "Unexpected result from the core bundle: \(message)"
        case .decodingFailed(let type, let reason):
            return "Could not decode \(type) from the core bundle: \(reason)"
        }
    }
}

final class CoreBridge {
    private static let resourceName = "GraceChordsCore"
    private static let globalName = "GraceChordsCore"

    /// Collects the last uncaught JS exception. A reference box rather than a
    /// stored property so `init` can install the handler before `self` exists.
    private final class ExceptionSink {
        var message: String?

        func take() -> String? {
            defer { message = nil }
            return message
        }
    }

    private let context: JSContext
    private let transposeFunction: JSValue
    private let parseFunction: JSValue
    private let renderFunction: JSValue
    private let stepsBetweenFunction: JSValue
    private let formatKeyFunction: JSValue
    private let lintFunction: JSValue
    private let hasMinRoleFunction: JSValue
    private let slugifyFunction: JSValue
    private let sink: ExceptionSink

    /// Path of the bundle that was actually loaded — used by the spike's
    /// "is it really in Resources?" check.
    let bundleURL: URL

    init(bundle: Bundle = .main) throws {
        guard let url = bundle.url(forResource: Self.resourceName, withExtension: "js") else {
            throw CoreBridgeError.bundleMissing(searchedIn: bundle.bundlePath)
        }

        let source: String
        do {
            source = try String(contentsOf: url, encoding: .utf8)
        } catch {
            throw CoreBridgeError.bundleUnreadable(path: url.path, reason: error.localizedDescription)
        }

        // JavaScriptCore's headers are inconsistently nullability-annotated across
        // SDKs, so every JSC return value is widened to an Optional before being
        // unwrapped. That compiles whether the API imports as T, T!, or T?.
        let newContext: JSContext? = JSContext()
        guard let context = newContext else {
            throw CoreBridgeError.evaluationFailed("JSContext could not be created")
        }

        let sink = ExceptionSink()
        context.name = Self.globalName
        context.exceptionHandler = { _, exception in
            sink.message = CoreBridge.describe(exception)
        }

        context.evaluateScript(source, withSourceURL: url)
        if let message = sink.take() {
            throw CoreBridgeError.evaluationFailed(message)
        }

        // A missing key yields a JSValue wrapping `undefined`, not nil.
        let namespaceValue: JSValue? = context.objectForKeyedSubscript(Self.globalName)
        guard let namespace = namespaceValue, !namespace.isUndefined, !namespace.isNull else {
            throw CoreBridgeError.missingExport("the \(Self.globalName) global")
        }
        self.bundleURL = url
        self.context = context
        self.transposeFunction = try Self.requireFunction(named: "transpose", on: namespace)
        self.parseFunction = try Self.requireFunction(named: "parseToJSON", on: namespace)
        self.renderFunction = try Self.requireFunction(named: "renderToJSON", on: namespace)
        self.stepsBetweenFunction = try Self.requireFunction(named: "stepsBetween", on: namespace)
        self.formatKeyFunction = try Self.requireFunction(named: "formatKey", on: namespace)
        self.lintFunction = try Self.requireFunction(named: "lintToJSON", on: namespace)
        self.hasMinRoleFunction = try Self.requireFunction(named: "hasMinRole", on: namespace)
        self.slugifyFunction = try Self.requireFunction(named: "slugify", on: namespace)
        self.sink = sink
    }

    private static func requireFunction(named name: String, on namespace: JSValue) throws -> JSValue {
        let value: JSValue? = namespace.objectForKeyedSubscript(name)
        guard let function = value, function.isObject else {
            throw CoreBridgeError.missingExport("\(globalName).\(name)")
        }
        return function
    }

    /// Transpose a chord symbol through `packages/core`'s `transposeSymPrefer`.
    ///
    /// Matches apps/mobile exactly, including core's pass-through of symbols it
    /// does not recognize: `transpose("H7", steps: 2)` returns `"H7"` rather than
    /// throwing. Invalid *arguments* (an empty symbol) do throw.
    func transpose(_ symbol: String, steps: Int, preferFlat: Bool = false) throws -> String {
        let arguments = try jsValues([
            .string(symbol),
            .number(Double(steps)),
            .boolean(preferFlat),
        ])
        return try callReturningString(transposeFunction, named: "transpose", arguments: arguments)
    }

    /// Parse a ChordPro body through `packages/core`'s `parseChordProOrLegacy`.
    ///
    /// The bundle returns the whole document as JSON, so the nested structure
    /// decodes in one step instead of being walked node by node as JSValues.
    /// An empty body is valid and yields a document with no sections.
    func parse(_ chordpro: String) throws -> SongDoc {
        let arguments = try jsValues([.string(chordpro)])
        let json = try callReturningString(parseFunction, named: "parseToJSON", arguments: arguments)
        return try decodeDoc(from: json)
    }

    /// Parse a ChordPro body *and* apply the Viewer's transpose and chord-style
    /// options, in one bridge call.
    ///
    /// One call rather than a JSValue round trip per chord: SwiftUI re-renders the
    /// chart on every option change, and per-symbol calls would put
    /// JavaScriptCore in the middle of a layout pass hundreds of times per song.
    /// The mapping itself lives in the JS bridge so it composes core's own
    /// primitives exactly as apps/mobile's ChordChart does.
    ///
    /// `doc.meta.key` comes back untouched — it is the song's *native* key, which
    /// the caller needs as the transpose origin rather than as a display value.
    func render(
        _ chordpro: String,
        steps: Int,
        preferFlat: Bool,
        style: ChordStyle
    ) throws -> SongDoc {
        let arguments = try jsValues([
            .string(chordpro),
            .number(Double(steps)),
            .boolean(preferFlat),
            .string(style.rawValue),
        ])
        let json = try callReturningString(renderFunction, named: "renderToJSON", arguments: arguments)
        return try decodeDoc(from: json)
    }

    /// Semitones from `fromKey` up to `toKey`, 0–11.
    ///
    /// Core answers 0 for keys it does not recognize, which is what lets the
    /// Viewer seed a transpose before the song's key is known.
    func stepsBetween(from fromKey: String, to toKey: String) throws -> Int {
        let arguments = try jsValues([.string(fromKey), .string(toKey)])
        return try callReturningInt(stepsBetweenFunction, named: "stepsBetween", arguments: arguments)
    }

    /// A key as it should be displayed — passed through for `.letters`, converted
    /// to solfège syllables for `.solfege`.
    func formatKey(_ key: String, style: ChordStyle) throws -> String {
        let arguments = try jsValues([.string(key), .string(style.rawValue)])
        return try callReturningString(formatKeyFunction, named: "formatKey", arguments: arguments)
    }

    /// Lint a ChordPro body through `packages/core`'s `lintChordPro`.
    ///
    /// Advisory only. Core emits nothing but `warn:*` codes and has no severity
    /// field, so there is no "error" to distinguish here — a body so malformed that
    /// it cannot be parsed at all surfaces through `parse`/`render` throwing
    /// instead, which the editor presents separately. Consequently lint never
    /// fails a save; it annotates one.
    ///
    /// The raw string is passed through rather than a parsed document because core
    /// only runs its unbalanced-`{start_of_*}` scan on raw text, so linting the
    /// editor's buffer catches strictly more than linting its parse would.
    func lint(_ chordpro: String) throws -> [LintWarning] {
        let arguments = try jsValues([.string(chordpro)])
        let json = try callReturningString(lintFunction, named: "lintToJSON", arguments: arguments)
        return try decodeJSON([LintWarning].self, from: json, describedAs: "lint warnings")
    }

    /// Role-hierarchy check through `packages/core`'s `hasMinRole`.
    ///
    /// Bridged rather than reimplemented because AGENTS.md makes rbac/roles.js the
    /// one source of truth for gate checks: a Swift copy of ROLE_ORDER is exactly
    /// what outlives a hierarchy change unnoticed, and `collaborator` was already
    /// removed from that list once.
    ///
    /// Core's tolerance is preserved — an unrecognised role grants nothing, and an
    /// empty role is read as `user` — so the caller may ask before the role has
    /// loaded and get the closed answer.
    func hasMinRole(_ role: String, atLeast minimum: String) throws -> Bool {
        let arguments = try jsValues([.string(role), .string(minimum)])
        return try callReturningBool(hasMinRoleFunction, named: "hasMinRole", arguments: arguments)
    }

    /// Title → URL-safe slug through `packages/core`'s `slugify`.
    ///
    /// Returns "" when the title contains no alphanumerics — core's signal that no
    /// slug can be derived. `songs.slug` is UNIQUE NOT NULL, so a caller that gets
    /// "" must refuse the write rather than pass it along.
    func slugify(_ title: String) throws -> String {
        let arguments = try jsValues([.string(title)])
        return try callReturningString(slugifyFunction, named: "slugify", arguments: arguments)
    }

    /// Interpolation values for the capo chip, or nil when the chip is hidden.
    ///
    /// Port of `capoChipValues` in apps/mobile/src/lib/capo.ts: the fret is pure
    /// Swift, the sounding key and its spelling come from core.
    func capoChip(
        delta: Int,
        displayedKey: String,
        preferFlat: Bool,
        style: ChordStyle
    ) throws -> (fret: Int, key: String)? {
        guard let fret = Capo.fret(delta: delta), !displayedKey.isEmpty else { return nil }
        let sounding = try transpose(displayedKey, steps: fret, preferFlat: preferFlat)
        return (fret, try formatKey(sounding, style: style))
    }

    // MARK: - Argument plumbing

    /// A Swift value to hand to JavaScript. Arguments are built explicitly rather
    /// than relying on Swift→NSNumber bridging, which could pass a `Bool` to JS as
    /// a number instead of a boolean.
    private enum Argument {
        case string(String)
        case number(Double)
        case boolean(Bool)
    }

    private func jsValues(_ arguments: [Argument]) throws -> [JSValue] {
        try arguments.map { argument in
            let value: JSValue?
            switch argument {
            case .string(let string): value = JSValue(object: string, in: context)
            case .number(let double): value = JSValue(double: double, in: context)
            case .boolean(let bool): value = JSValue(bool: bool, in: context)
            }
            guard let value = value else {
                throw CoreBridgeError.unexpectedResult("arguments could not be converted to JSValues")
            }
            return value
        }
    }

    private func decodeDoc(from json: String) throws -> SongDoc {
        try decodeJSON(SongDoc.self, from: json, describedAs: "the parsed song")
    }

    private func decodeJSON<T: Decodable>(
        _ type: T.Type,
        from json: String,
        describedAs description: String
    ) throws -> T {
        guard let data = json.data(using: .utf8) else {
            throw CoreBridgeError.unexpectedResult("\(description): JSON was not valid UTF-8")
        }
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw CoreBridgeError.decodingFailed(type: description, reason: "\(error)")
        }
    }

    private func callReturningBool(
        _ function: JSValue,
        named name: String,
        arguments: [JSValue]
    ) throws -> Bool {
        _ = sink.take()
        let returned: JSValue? = function.call(withArguments: arguments)
        if let message = sink.take() {
            throw CoreBridgeError.jsException(message)
        }
        guard let result = returned else {
            throw CoreBridgeError.unexpectedResult("\(name) returned no value")
        }
        // `isBoolean`, not `toBool()`: JSValue happily coerces a string or a number
        // to a boolean, which would turn a bridge-contract break into a silently
        // wrong permission answer.
        guard result.isBoolean else {
            throw CoreBridgeError.unexpectedResult("\(name) expected a boolean, got \(result)")
        }
        return result.toBool()
    }

    private func callReturningInt(
        _ function: JSValue,
        named name: String,
        arguments: [JSValue]
    ) throws -> Int {
        _ = sink.take()
        let returned: JSValue? = function.call(withArguments: arguments)
        if let message = sink.take() {
            throw CoreBridgeError.jsException(message)
        }
        guard let result = returned else {
            throw CoreBridgeError.unexpectedResult("\(name) returned no value")
        }
        guard result.isNumber else {
            throw CoreBridgeError.unexpectedResult("\(name) expected a number, got \(result)")
        }
        return Int(result.toInt32())
    }

    private func callReturningString(
        _ function: JSValue,
        named name: String,
        arguments: [JSValue]
    ) throws -> String {
        _ = sink.take()

        let returned: JSValue? = function.call(withArguments: arguments)

        if let message = sink.take() {
            throw CoreBridgeError.jsException(message)
        }
        guard let result = returned else {
            throw CoreBridgeError.unexpectedResult("\(name) returned no value")
        }
        guard result.isString else {
            throw CoreBridgeError.unexpectedResult("\(name) expected a string, got \(result)")
        }
        let converted: String? = result.toString()
        guard let string = converted else {
            throw CoreBridgeError.unexpectedResult("\(name) result could not be read as a string")
        }
        return string
    }

    private static func describe(_ exception: JSValue?) -> String {
        guard let exception = exception else { return "unknown JavaScript exception" }
        // JSValue's description is its JS string representation, so this reads as
        // e.g. "TypeError: transpose: sym must be a non-empty string, got ''".
        var description = "\(exception)"
        let lineValue: JSValue? = exception.objectForKeyedSubscript("line")
        if let line = lineValue, !line.isUndefined, !line.isNull {
            description += " (line \(line))"
        }
        return description
    }
}
