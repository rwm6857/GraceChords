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
    case decodingFailed(String)

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
        case .decodingFailed(let message):
            return "Could not decode the parsed song: \(message)"
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
        // Arguments are built explicitly rather than relying on Swift→NSNumber
        // bridging, which could hand `preferFlat` to JS as a number, not a boolean.
        let symbolValue: JSValue? = JSValue(object: symbol, in: context)
        let stepsValue: JSValue? = JSValue(double: Double(steps), in: context)
        let preferFlatValue: JSValue? = JSValue(bool: preferFlat, in: context)
        guard let symbolArgument = symbolValue,
              let stepsArgument = stepsValue,
              let preferFlatArgument = preferFlatValue else {
            throw CoreBridgeError.unexpectedResult("arguments could not be converted to JSValues")
        }
        return try callReturningString(
            transposeFunction,
            named: "transpose",
            arguments: [symbolArgument, stepsArgument, preferFlatArgument]
        )
    }

    /// Parse a ChordPro body through `packages/core`'s `parseChordProOrLegacy`.
    ///
    /// The bundle returns the whole document as JSON, so the nested structure
    /// decodes in one step instead of being walked node by node as JSValues.
    /// An empty body is valid and yields a document with no sections.
    func parse(_ chordpro: String) throws -> SongDoc {
        let inputValue: JSValue? = JSValue(object: chordpro, in: context)
        guard let input = inputValue else {
            throw CoreBridgeError.unexpectedResult("song body could not be converted to a JSValue")
        }
        let json = try callReturningString(parseFunction, named: "parseToJSON", arguments: [input])

        guard let data = json.data(using: .utf8) else {
            throw CoreBridgeError.unexpectedResult("parsed JSON was not valid UTF-8")
        }
        do {
            return try JSONDecoder().decode(SongDoc.self, from: data)
        } catch {
            throw CoreBridgeError.decodingFailed("\(error)")
        }
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
