//
//  Theme.swift
//  GraceChords Studio
//
//  The SwiftUI layer over DesignTokens.generated.swift. This file is hand-written
//  and holds no token *values* — only how the generated ones resolve on macOS:
//
//   - GCRGBA / GCDynamicColor: components → a Color that follows the system
//     appearance, including the Increase-Contrast variants.
//   - GCTextSpec / GCTypeScale: the canonical iOS ramp → macOS point sizes.
//   - GCGradient.hero(for:): stops → a drawable gradient.
//
//  Add token values in packages/tokens/native.ts and regenerate; add *platform
//  behavior* here.
//

import AppKit
import SwiftUI

// MARK: - Colors

/// sRGB components in 0–1, as emitted by the token generator.
///
/// Parsing happens at generation time rather than here, so a malformed token in
/// `native.ts` fails the build script instead of rendering a wrong color.
struct GCRGBA {
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double

    var nsColor: NSColor {
        NSColor(srgbRed: red, green: green, blue: blue, alpha: alpha)
    }

    var color: Color { Color(nsColor: nsColor) }
}

/// A token's four macOS appearance variants.
///
/// Resolution is delegated to AppKit's dynamic-color mechanism rather than to a
/// SwiftUI `@Environment(\.colorScheme)` lookup, which means it works without any
/// environment plumbing, updates when the user flips Appearance or Increase
/// Contrast mid-session, and stays correct inside AppKit-backed surfaces
/// (toolbars, menus, `NSHostingView`) where the SwiftUI environment does not
/// reach. The mobile app reaches the same four combinations through its
/// ThemeProvider — see `getTokens(mode:increaseContrast:)` in native.ts.
struct GCDynamicColor {
    let light: GCRGBA
    let dark: GCRGBA
    let lightIncreasedContrast: GCRGBA
    let darkIncreasedContrast: GCRGBA

    /// Appearances asked of `bestMatch(from:)`, in the order AppKit should
    /// consider them. The high-contrast names are what macOS reports while
    /// System Settings ▸ Accessibility ▸ Display ▸ Increase contrast is on.
    private static let appearances: [NSAppearance.Name] = [
        .aqua,
        .darkAqua,
        .accessibilityHighContrastAqua,
        .accessibilityHighContrastDarkAqua,
    ]

    var color: Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            switch appearance.bestMatch(from: Self.appearances) {
            case .darkAqua:
                return dark.nsColor
            case .accessibilityHighContrastAqua:
                return lightIncreasedContrast.nsColor
            case .accessibilityHighContrastDarkAqua:
                return darkIncreasedContrast.nsColor
            default:
                return light.nsColor
            }
        })
    }
}

// MARK: - Gradients

extension GCGradient {
    /// The atmospheric hero gradient, top to bottom.
    ///
    /// Read the scheme from the environment at the call site:
    /// `@Environment(\.colorScheme) private var scheme`.
    static func hero(for scheme: ColorScheme) -> LinearGradient {
        LinearGradient(stops: heroGradientStops(for: scheme), startPoint: .top, endPoint: .bottom)
    }
}

// MARK: - Typography

/// One rung of the type ramp. Sizes arrive in the iOS points `native.ts`
/// declares and are scaled for macOS on read — never use `size` directly.
struct GCTextSpec {
    let size: CGFloat
    let weight: Font.Weight
    let tracking: CGFloat

    /// The ramp size scaled for macOS, rounded to the nearest half point.
    var macOSSize: CGFloat { Self.roundedToHalf(size * GCTypeScale.macOS) }

    /// Letter spacing scaled by the same factor, so tracking stays proportional.
    var macOSTracking: CGFloat { tracking * GCTypeScale.macOS }

    var font: Font { .system(size: macOSSize, weight: weight) }

    private static func roundedToHalf(_ value: CGFloat) -> CGFloat {
        (value * 2).rounded() / 2
    }
}

enum GCTypeScale {
    /// The shared ramp is iOS-tuned (a 27pt large title against a 17pt iOS body),
    /// and macOS's system body is 13pt — porting those numbers verbatim reads as
    /// oversized in a Mac window, and `apps/mobile/AGENTS.md`'s rule is that the
    /// platform HIG wins over a pixel-for-pixel port. This factor translates the
    /// ramp instead of redefining it, so the *relationships* between rungs stay
    /// shared with mobile while the absolute sizes are native.
    ///
    /// 0.82 was chosen because it lands `body` on exactly 13pt — macOS's system
    /// body size — with the rest falling out sensibly: largeTitle 27→22,
    /// rowTitle 16.5→13.5, rowSubtitle 13.5→11, overline 12→10.
    static let macOS: CGFloat = 0.82
}

extension View {
    /// Applies a ramp rung: the scaled font plus its letter spacing.
    func gcTextStyle(_ spec: GCTextSpec) -> some View {
        font(spec.font).tracking(spec.macOSTracking)
    }
}
