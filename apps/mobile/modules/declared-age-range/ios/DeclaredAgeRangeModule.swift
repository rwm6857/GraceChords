import ExpoModulesCore
import UIKit
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

// Bridges Apple's iOS 26+ Declared Age Range API to JS. `requestAgeRange` returns
// one of "over_13" / "under_13" / "unknown" (relative to a single age gate at 13).
// The JS wrapper (src/lib/declaredAgeRange.ts) treats "unknown" as "fall back to
// self-declaration", so a decline / error / unavailable OS all degrade safely.
//
// Requires the `com.apple.developer.declared-age-range` entitlement (wired via
// app.json → ios.entitlements) AND the "Declared Age Range" capability enabled on
// the App ID in the Apple Developer portal. Symbols verified against the
// DeclaredAgeRange.framework .swiftinterface in the iOS 26.5 SDK (Xcode 26):
// AgeRangeService.shared.requestAgeRange(ageGates:_:_:in:) -> Response, with
// Response.sharing(range:)/.declinedSharing and AgeRange.lowerBound/upperBound (Int?).
// Not testable on Simulator — the API only resolves on a real device.
public class DeclaredAgeRangeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeclaredAgeRange")

    AsyncFunction("requestAgeRange") { () async -> String in
      #if canImport(DeclaredAgeRange)
      if #available(iOS 26.0, *) {
        return await self.resolveAgeRange()
      }
      #endif
      return "unknown"
    }
  }

  #if canImport(DeclaredAgeRange)
  // Presents the system age-range sheet (main actor) and maps Apple's response to
  // our coarse over/under-13 result. ageGates:13 splits the answer into either an
  // upper-bounded range below 13 or a lower-bounded range at/above 13.
  @available(iOS 26.0, *)
  @MainActor
  private func resolveAgeRange() async -> String {
    guard let viewController = appContext?.utilities?.currentViewController() else {
      return "unknown"
    }
    do {
      let response = try await AgeRangeService.shared.requestAgeRange(
        ageGates: 13, in: viewController
      )
      switch response {
      case .sharing(let range):
        // Apple returns a half-open bracket around the gate: 13+ is [13, nil)
        // (lowerBound == 13), under-13 is [nil, 13) (upperBound == 13). Use `<= 13`
        // so the exclusive upper bound of the under-13 bracket still resolves to
        // "under_13"; the 13+ bracket has upperBound == nil so it never matches here.
        if let lower = range.lowerBound, lower >= 13 { return "over_13" }
        if let upper = range.upperBound, upper <= 13 { return "under_13" }
        return "unknown"
      case .declinedSharing:
        return "unknown"
      @unknown default:
        return "unknown"
      }
    } catch {
      return "unknown"
    }
  }
  #endif
}
