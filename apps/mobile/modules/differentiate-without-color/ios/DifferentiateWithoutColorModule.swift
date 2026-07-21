import ExpoModulesCore
import UIKit

// Exposes iOS's "Differentiate Without Color" accessibility setting to JS.
// React Native does not surface `UIAccessibility.shouldDifferentiateWithoutColor`,
// so this small local module reads it and emits `onChange` from the system
// `differentiateWithoutColorDidChangeNotification`. iOS-only (Apple platform);
// the JS wrapper (src/lib/differentiateWithoutColor.ts) degrades to "off" wherever
// the module is not linked.
public class DifferentiateWithoutColorModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("DifferentiateWithoutColor")

    Events("onChange")

    AsyncFunction("getShouldDifferentiateWithoutColor") { () -> Bool in
      UIAccessibility.shouldDifferentiateWithoutColor
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: UIAccessibility.differentiateWithoutColorDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onChange", [
          "value": UIAccessibility.shouldDifferentiateWithoutColor
        ])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
      }
    }
  }
}
