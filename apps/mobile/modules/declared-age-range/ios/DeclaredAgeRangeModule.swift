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
// the App ID in the Apple Developer portal. Verify the exact symbol names in
// Xcode 26 Quick Help before shipping — this is written from Apple's published
// docs but has not been compiled here.
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
        ageGates: 13, nil, nil, in: viewController
      )
      switch response {
      case .sharing(let range):
        if let lower = range.lowerBound, lower >= 13 { return "over_13" }
        if let upper = range.upperBound, upper < 13 { return "under_13" }
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
