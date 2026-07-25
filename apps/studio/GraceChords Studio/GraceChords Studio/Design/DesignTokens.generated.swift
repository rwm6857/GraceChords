//
//  DesignTokens.generated.swift
//  GraceChords Studio
//
//  GENERATED FILE — DO NOT EDIT.
//
//  Source of truth: packages/tokens/native.ts (the same map apps/mobile consumes,
//  so the Signal-blue palette cannot drift between the iOS app and Studio).
//  Regenerate with: npm run tokens:swift
//
//  Every color carries all four macOS appearance variants — light and dark, each
//  with an Increase-Contrast form built from native.ts's contrast-boost overlays.
//  The resolution happens in Theme.swift, which also holds the macOS type scale
//  (the ramp below is the canonical iOS one, in iOS points).
//

import SwiftUI

// MARK: - Colors

/// The palette, as dynamic colors that follow the system appearance.
enum GCColor {
    /// Page background (the surface the list scrolls on).
    static let bg = GCDynamicColor(
        light: GCRGBA(red: 0.960784, green: 0.968627, blue: 0.976471, alpha: 1.0),
        dark: GCRGBA(red: 0.078431, green: 0.090196, blue: 0.101961, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.960784, green: 0.968627, blue: 0.976471, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.078431, green: 0.090196, blue: 0.101961, alpha: 1.0)
    ).color

    /// Raised surfaces: cards, tab bar, sheets.
    static let surface = GCDynamicColor(
        light: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0),
        dark: GCRGBA(red: 0.117647, green: 0.133333, blue: 0.152941, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.117647, green: 0.133333, blue: 0.152941, alpha: 1.0)
    ).color

    /// Recessed surfaces: search field, icon buttons.
    static let surfaceAlt = GCDynamicColor(
        light: GCRGBA(red: 0.933333, green: 0.945098, blue: 0.956863, alpha: 1.0),
        dark: GCRGBA(red: 0.141176, green: 0.164706, blue: 0.188235, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.933333, green: 0.945098, blue: 0.956863, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.141176, green: 0.164706, blue: 0.188235, alpha: 1.0)
    ).color

    /// Primary text.
    static let ink = GCDynamicColor(
        light: GCRGBA(red: 0.117647, green: 0.133333, blue: 0.152941, alpha: 1.0),
        dark: GCRGBA(red: 0.909804, green: 0.92549, blue: 0.941176, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.117647, green: 0.133333, blue: 0.152941, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.909804, green: 0.92549, blue: 0.941176, alpha: 1.0)
    ).color

    /// Secondary text (e.g. artist line).
    static let sec = GCDynamicColor(
        light: GCRGBA(red: 0.360784, green: 0.396078, blue: 0.435294, alpha: 1.0),
        dark: GCRGBA(red: 0.682353, green: 0.713725, blue: 0.745098, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.270588, green: 0.298039, blue: 0.329412, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.780392, green: 0.807843, blue: 0.835294, alpha: 1.0)
    ).color

    /// Muted text (e.g. time signature, section letters).
    static let muted = GCDynamicColor(
        light: GCRGBA(red: 0.541176, green: 0.572549, blue: 0.607843, alpha: 1.0),
        dark: GCRGBA(red: 0.486275, green: 0.521569, blue: 0.556863, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.352941, green: 0.384314, blue: 0.419608, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.603922, green: 0.635294, blue: 0.666667, alpha: 1.0)
    ).color

    /// The one accent — Signal blue.
    static let accent = GCDynamicColor(
        light: GCRGBA(red: 0.121569, green: 0.517647, blue: 0.788235, alpha: 1.0),
        dark: GCRGBA(red: 0.305882, green: 0.65098, blue: 0.901961, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.121569, green: 0.517647, blue: 0.788235, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.305882, green: 0.65098, blue: 0.901961, alpha: 1.0)
    ).color

    /// Soft accent fill (e.g. add-button background).
    static let accentSoft = GCDynamicColor(
        light: GCRGBA(red: 0.85098, green: 0.917647, blue: 0.964706, alpha: 1.0),
        dark: GCRGBA(red: 0.141176, green: 0.2, blue: 0.25098, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.85098, green: 0.917647, blue: 0.964706, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.141176, green: 0.2, blue: 0.25098, alpha: 1.0)
    ).color

    /// Accent tuned for text/legibility on the page background.
    static let textAccent = GCDynamicColor(
        light: GCRGBA(red: 0.082353, green: 0.380392, blue: 0.603922, alpha: 1.0),
        dark: GCRGBA(red: 0.435294, green: 0.713725, blue: 0.917647, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.058824, green: 0.313725, blue: 0.533333, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.541176, green: 0.768627, blue: 0.933333, alpha: 1.0)
    ).color

    /// Hairline borders / separators.
    static let border = GCDynamicColor(
        light: GCRGBA(red: 0.890196, green: 0.909804, blue: 0.92549, alpha: 1.0),
        dark: GCRGBA(red: 0.164706, green: 0.188235, blue: 0.211765, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.768627, green: 0.8, blue: 0.827451, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.235294, green: 0.266667, blue: 0.298039, alpha: 1.0)
    ).color

    /// Text/icon color on top of the accent.
    static let onAccent = GCDynamicColor(
        light: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0),
        dark: GCRGBA(red: 0.078431, green: 0.090196, blue: 0.101961, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.078431, green: 0.090196, blue: 0.101961, alpha: 1.0)
    ).color

    /// Destructive actions (delete/remove) — text on surfaces and fills.
    static let danger = GCDynamicColor(
        light: GCRGBA(red: 0.768627, green: 0.239216, blue: 0.219608, alpha: 1.0),
        dark: GCRGBA(red: 0.941176, green: 0.45098, blue: 0.415686, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.768627, green: 0.239216, blue: 0.219608, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.941176, green: 0.45098, blue: 0.415686, alpha: 1.0)
    ).color

    /// Text/icon color on top of the danger fill.
    static let onDanger = GCDynamicColor(
        light: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0),
        dark: GCRGBA(red: 0.078431, green: 0.090196, blue: 0.101961, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.078431, green: 0.090196, blue: 0.101961, alpha: 1.0)
    ).color

    /// Favorite/star fill (gold).
    static let star = GCDynamicColor(
        light: GCRGBA(red: 0.941176, green: 0.690196, blue: 0.0, alpha: 1.0),
        dark: GCRGBA(red: 1.0, green: 0.8, blue: 0.0, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.941176, green: 0.690196, blue: 0.0, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 1.0, green: 0.8, blue: 0.0, alpha: 1.0)
    ).color

    /// Positive/confirmed state (e.g. tuner in-tune).
    static let success = GCDynamicColor(
        light: GCRGBA(red: 0.203922, green: 0.780392, blue: 0.34902, alpha: 1.0),
        dark: GCRGBA(red: 0.188235, green: 0.819608, blue: 0.345098, alpha: 1.0),
        lightIncreasedContrast: GCRGBA(red: 0.203922, green: 0.780392, blue: 0.34902, alpha: 1.0),
        darkIncreasedContrast: GCRGBA(red: 0.188235, green: 0.819608, blue: 0.345098, alpha: 1.0)
    ).color

    /// Dimmed color for inactive scrubber letters.
    static let off = GCDynamicColor(
        light: GCRGBA(red: 0.541176, green: 0.572549, blue: 0.607843, alpha: 0.45),
        dark: GCRGBA(red: 0.486275, green: 0.521569, blue: 0.556863, alpha: 0.5),
        lightIncreasedContrast: GCRGBA(red: 0.352941, green: 0.384314, blue: 0.419608, alpha: 0.7),
        darkIncreasedContrast: GCRGBA(red: 0.603922, green: 0.635294, blue: 0.666667, alpha: 0.75)
    ).color

    /// Soft top-center highlight overlaid on the hero to hint the radial glow.
    static let heroGlow = GCDynamicColor(
        light: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.55),
        dark: GCRGBA(red: 0.305882, green: 0.65098, blue: 0.901961, alpha: 0.18),
        lightIncreasedContrast: GCRGBA(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.55),
        darkIncreasedContrast: GCRGBA(red: 0.305882, green: 0.65098, blue: 0.901961, alpha: 0.18)
    ).color
}

// MARK: - Gradients

/// The sanctioned gradients. Locations differ per appearance, so these take an
/// explicit `ColorScheme` rather than resolving dynamically like colors do.
enum GCGradient {
    /// The atmospheric hero gradient (Home) — the one sanctioned gradient, an atmospheric header,
    /// never a UI-surface gradient.
    static func heroGradientStops(for scheme: ColorScheme) -> [Gradient.Stop] {
        switch scheme {
        case .dark:
            return [
                Gradient.Stop(
                    color: GCRGBA(red: 0.109804, green: 0.164706, blue: 0.211765, alpha: 1.0).color,
                    location: 0.0
                ),
                Gradient.Stop(
                    color: GCRGBA(red: 0.094118, green: 0.133333, blue: 0.164706, alpha: 1.0).color,
                    location: 0.38
                ),
                Gradient.Stop(
                    color: GCRGBA(red: 0.082353, green: 0.098039, blue: 0.113725, alpha: 1.0).color,
                    location: 0.78
                ),
                Gradient.Stop(
                    color: GCRGBA(red: 0.078431, green: 0.090196, blue: 0.101961, alpha: 1.0).color,
                    location: 1.0
                ),
            ]
        default:
            return [
                Gradient.Stop(
                    color: GCRGBA(red: 0.74902, green: 0.827451, blue: 0.890196, alpha: 1.0).color,
                    location: 0.0
                ),
                Gradient.Stop(
                    color: GCRGBA(red: 0.811765, green: 0.878431, blue: 0.917647, alpha: 1.0).color,
                    location: 0.34
                ),
                Gradient.Stop(
                    color: GCRGBA(red: 0.890196, green: 0.929412, blue: 0.94902, alpha: 1.0).color,
                    location: 0.72
                ),
                Gradient.Stop(
                    color: GCRGBA(red: 0.960784, green: 0.968627, blue: 0.976471, alpha: 1.0).color,
                    location: 1.0
                ),
            ]
        }
    }
}

// MARK: - Spacing

/// 4-pt spacing scale.
enum GCSpacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
}

// MARK: - Radii

/// Corner radii.
enum GCRadius {
    static let sm: CGFloat = 10
    static let md: CGFloat = 12
    static let card: CGFloat = 14
    static let sheet: CGFloat = 20
    static let pill: CGFloat = 999
}

// MARK: - Layout

/// Content-width caps and layout constants.
enum GCLayout {
    enum MaxWidth {
        /// Focused single-column forms (e.g. the auth screen).
        static let form: CGFloat = 440

        /// General content columns (index lists).
        static let content: CGFloat = 700

        /// The Home dashboard's two-column grid region.
        static let dashboard: CGFloat = 1000
    }

    /// Entries shown in Home's Recent-songs card.
    static let recentSongs: Int = 6

    /// Flex weights for tablet list-detail splits (Setlist Builder's library pane · builder column,
    /// Utilities' tool list · tool view): ~1/3 · 2/3.
    enum Split {
        static let list: Int = 1
        static let detail: Int = 2
    }

    /// Song Library grid columns at regular (tablet) width, by orientation. Compact (phone) width
    /// always renders single-column.
    enum LibraryColumns {
        static let portrait: Int = 2
        static let landscape: Int = 3
    }
}

// MARK: - Typography

/// The canonical type ramp, in the iOS points native.ts declares. `GCTextSpec`
/// scales these for macOS — see `GCTypeScale` in Theme.swift.
extension GCTextSpec {
    /// Large screen title, e.g. "Song Library".
    static let largeTitle = GCTextSpec(
        size: 27,
        weight: .bold,
        tracking: -0.4
    )

    /// Section header letter / "Key of X".
    static let sectionHeader = GCTextSpec(
        size: 13,
        weight: .bold,
        tracking: 0.2
    )

    /// Row title.
    static let rowTitle = GCTextSpec(
        size: 16.5,
        weight: .semibold,
        tracking: -0.3
    )

    /// Row subtitle (artist).
    static let rowSubtitle = GCTextSpec(
        size: 13.5,
        weight: .regular,
        tracking: 0
    )

    /// Row key.
    static let rowKey = GCTextSpec(
        size: 14,
        weight: .semibold,
        tracking: 0
    )

    /// Row time signature / small meta.
    static let rowMeta = GCTextSpec(
        size: 12.5,
        weight: .regular,
        tracking: 0
    )

    /// Body / control text.
    static let body = GCTextSpec(
        size: 16,
        weight: .regular,
        tracking: 0
    )

    /// Uppercase group label (e.g. "SORT BY").
    static let overline = GCTextSpec(
        size: 12,
        weight: .semibold,
        tracking: 0.6
    )
}
