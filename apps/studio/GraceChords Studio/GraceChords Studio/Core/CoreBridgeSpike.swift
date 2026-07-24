//
//  CoreBridgeSpike.swift
//  GraceChords Studio
//
//  Throwaway harness for the JavaScriptCore plumbing spike: runs a fixed table of
//  transpose cases through CoreBridge and reports pass/fail. The same table is
//  asserted against apps/mobile's resolved module by
//  apps/studio/js/verify-bundle.mjs, so agreement here means Studio and mobile
//  agree.
//

import Foundation

struct SpikeCheck: Identifiable {
    let id = UUID()
    let passed: Bool
    let text: String
}

struct SpikeReport {
    let headline: String
    let checks: [SpikeCheck]

    var allPassed: Bool { checks.allSatisfy { $0.passed } }
}

enum CoreBridgeSpike {
    struct TransposeCase {
        let symbol: String
        let steps: Int
        let preferFlat: Bool
        let expected: String
        let note: String?

        init(_ symbol: String, _ steps: Int, _ preferFlat: Bool, _ expected: String, note: String? = nil) {
            self.symbol = symbol
            self.steps = steps
            self.preferFlat = preferFlat
            self.expected = expected
            self.note = note
        }
    }

    /// Mirrors CASES in apps/studio/js/verify-bundle.mjs.
    static let transposeCases: [TransposeCase] = [
        TransposeCase("G", 2, false, "A"),
        TransposeCase("G", 0, false, "G"),
        TransposeCase("G", -2, false, "F"),
        TransposeCase("Bb", 2, false, "C"),
        TransposeCase("Bb", 1, false, "B"),
        TransposeCase("A#", 1, false, "B"),
        TransposeCase("C", 1, true, "Db"),
        TransposeCase("C", 1, false, "C#"),
        TransposeCase("Em", 3, false, "Gm"),
        TransposeCase("D/F#", 2, false, "E/G#"),
        TransposeCase("Ebmaj7", 5, false, "Abmaj7"),
        TransposeCase("H7", 2, false, "H7", note: "unrecognized symbol passes through (core behavior)"),
    ]

    static func run() -> SpikeReport {
        let bridge: CoreBridge
        do {
            bridge = try CoreBridge()
        } catch {
            return SpikeReport(
                headline: "Bridge failed to load",
                checks: [SpikeCheck(passed: false, text: message(for: error))]
            )
        }

        var checks: [SpikeCheck] = []

        let loadedPath = bridge.bundleURL.path
        let inResources = loadedPath.contains("/Contents/Resources/")
        checks.append(
            SpikeCheck(
                passed: inResources,
                text: "bundle loaded from \(shorten(loadedPath))"
            )
        )

        for testCase in transposeCases {
            let signedSteps = testCase.steps >= 0 ? "+\(testCase.steps)" : "\(testCase.steps)"
            let label = "transpose(\"\(testCase.symbol)\", \(signedSteps)"
                + (testCase.preferFlat ? ", preferFlat" : "")
                + ")"
            do {
                let actual = try bridge.transpose(
                    testCase.symbol,
                    steps: testCase.steps,
                    preferFlat: testCase.preferFlat
                )
                let passed = actual == testCase.expected
                var text = "\(label) = \"\(actual)\""
                if !passed { text += " — expected \"\(testCase.expected)\"" }
                if let note = testCase.note, passed { text += "  [\(note)]" }
                checks.append(SpikeCheck(passed: passed, text: text))
            } catch {
                checks.append(SpikeCheck(passed: false, text: "\(label) threw — \(message(for: error))"))
            }
        }

        // Invalid input must surface as a Swift error, not a crash, and the context
        // must stay usable afterwards.
        do {
            let value = try bridge.transpose("", steps: 2)
            checks.append(
                SpikeCheck(passed: false, text: "transpose(\"\", +2) returned \"\(value)\" instead of throwing")
            )
        } catch let error as CoreBridgeError {
            if case .jsException(let jsMessage) = error {
                checks.append(SpikeCheck(passed: true, text: "transpose(\"\", +2) threw as expected — \(jsMessage)"))
            } else {
                checks.append(
                    SpikeCheck(passed: false, text: "transpose(\"\", +2) threw the wrong error — \(message(for: error))")
                )
            }
        } catch {
            checks.append(
                SpikeCheck(passed: false, text: "transpose(\"\", +2) threw an unexpected error — \(message(for: error))")
            )
        }

        do {
            let recovered = try bridge.transpose("G", steps: 2)
            checks.append(
                SpikeCheck(
                    passed: recovered == "A",
                    text: "context still usable after the error — transpose(\"G\", +2) = \"\(recovered)\""
                )
            )
        } catch {
            checks.append(
                SpikeCheck(passed: false, text: "context unusable after the error — \(message(for: error))")
            )
        }

        let failures = checks.filter { !$0.passed }.count
        let headline = failures == 0
            ? "All \(checks.count) checks passed"
            : "\(failures) of \(checks.count) checks failed"
        return SpikeReport(headline: headline, checks: checks)
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "\(error)"
    }

    /// Trim the absolute build path down to the app bundle and below.
    private static func shorten(_ path: String) -> String {
        guard let range = path.range(of: ".app/") else { return path }
        let appName = path[..<range.lowerBound].split(separator: "/").last ?? ""
        return "…/\(appName).app/\(path[range.upperBound...])"
    }
}
