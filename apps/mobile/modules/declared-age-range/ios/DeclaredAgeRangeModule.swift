import ExpoModulesCore
import UIKit

// Bridges Apple's iOS 26+ Declared Age Range API to JS. `requestAgeRange` returns
// one of "over_13" / "under_13" / "unknown" (relative to the single age gate at
// 13). The JS wrapper (src/lib/declaredAgeRange.ts) treats "unknown" as
// "fall back to self-declaration", so any uncertainty degrades safely.
//
// ┌─ IMPLEMENTATION NOTE ──────────────────────────────────────────────────────┐
// │ The concrete call into the `DeclaredAgeRange` framework must be completed    │
// │ and verified against the iOS 26 SDK on a Mac (this cannot be compiled in a   │
// │ Linux CI/agent). Until then this returns "unknown" on every platform/OS so   │
// │ the app builds and simply relies on the self-declaration gate. Fill in the   │
// │ `#available(iOS 26.0, *)` branch with the real request:                      │
// │                                                                              │
// │   import DeclaredAgeRange                                                     │
// │   let response = try await AgeRangeService.shared                             │
// │       .requestAgeRange(ageGates: 13)                                          │
// │   switch response {                                                           │
// │   case .sharing(let range):                                                   │
// │     // range.lowerBound / range.upperBound relative to 13                     │
// │     return (range.lowerBound ?? 0) >= 13 ? "over_13" : "under_13"             │
// │   case .declinedSharing, .notAvailable: return "unknown"                      │
// │   @unknown default: return "unknown"                                          │
// │   }                                                                           │
// │                                                                              │
// │ Verify the exact type/case names against the shipping SDK before enabling.   │
// └──────────────────────────────────────────────────────────────────────────────┘
public class DeclaredAgeRangeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeclaredAgeRange")

    AsyncFunction("requestAgeRange") { () -> String in
      // TODO(ios26): replace with the real DeclaredAgeRange request (see note
      // above). Returning "unknown" keeps the build green and falls back to the
      // self-declaration gate until the API call is verified on-device.
      return "unknown"
    }
  }
}
