import { type ReactNode, useMemo } from 'react'
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassStyle,
} from 'expo-glass-effect'
import { useTheme } from '../theme/ThemeProvider'

// The single funnel for iOS 26 Liquid Glass chrome. Every surface that wants a
// glass material renders through here so the platform gate and the fallback
// live in ONE place — future-proofing an Android glass equivalent and any
// change to the fallback is a one-file edit, never a screen-by-screen sweep.
//
// Three tiers:
//   • iOS 26 with the glass API available → a real UIVisualEffectView (GlassView).
//   • iOS < 26 → a plain View filled with `fallbackColor` (the surface look
//     each call site had before glass existed; pass 'transparent' to keep a
//     bar that never had a fill).
//   • Android → same solid fallback (GlassView already no-ops to a View there;
//     we render the fallback explicitly so the border/fill/shadow survive).
//
// Note the two-part gate: isLiquidGlassAvailable() reports Liquid Glass is the
// active design, and isGlassEffectAPIAvailable() guards the iOS 26 *beta*
// versions where calling the API crashes (expo/expo#40911). Platform.OS pins
// it to iOS so the Android build never touches the iOS-only availability check.
//
// SDK 55 caveat baked into the contract: do NOT animate this component's — or
// any ancestor's — opacity to 0, or the glass stops rendering. Auto-hide/fade
// callers must drive `glassEffectStyle` animation instead, which is why the
// opacity-animated performer/viewer overlays are intentionally NOT glassed yet.

export function isGlassSupported(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
}

export type GlassSurfaceProps = {
  /**
   * Layout, border, radius and shadow. MUST NOT include `backgroundColor` —
   * the material (glass) or `fallbackColor` (solid) owns the fill so the glass
   * is never hidden behind an opaque layer.
   */
  style?: StyleProp<ViewStyle>
  /** Solid fill on non-glass devices. Defaults to the raised `surface` token. */
  fallbackColor?: string
  /**
   * Non-glass only: draw a hairline bottom separator on the solid fallback.
   * Glass supplies its own edge via the blurred material, so this is ignored on
   * iOS 26. Set it on scroll-behind top bars whose fallback fill matches the
   * page background — without it the bar has no visible edge on iOS < 26.
   */
  fallbackHairline?: boolean
  /** GlassView tint on iOS 26. Omit for a neutral (untinted) material. */
  glassTint?: string
  /** Glass material weight on iOS 26. */
  glassStyle?: GlassStyle
  /** Whether the glass reacts to touches (highlights on press) — for buttons. */
  isInteractive?: boolean
  /** Forwarded to both branches so callers can measure the surface. */
  onLayout?: ViewProps['onLayout']
  /** Forwarded to both branches for touch gating (e.g. hidden chrome). */
  pointerEvents?: ViewProps['pointerEvents']
  children?: ReactNode
}

export default function GlassSurface({
  style,
  fallbackColor,
  fallbackHairline = false,
  glassTint,
  glassStyle = 'regular',
  isInteractive = false,
  onLayout,
  pointerEvents,
  children,
}: GlassSurfaceProps) {
  const t = useTheme()
  // Availability is fixed per device/OS; compute once. `t.mode` still drives the
  // glass appearance so a forced light/dark override is honored (colorScheme).
  const supported = useMemo(() => isGlassSupported(), [])

  if (supported) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        tintColor={glassTint}
        colorScheme={t.mode}
        isInteractive={isInteractive}
        onLayout={onLayout}
        pointerEvents={pointerEvents}
        style={style}
      >
        {children}
      </GlassView>
    )
  }

  return (
    <View
      onLayout={onLayout}
      pointerEvents={pointerEvents}
      style={[
        style,
        { backgroundColor: fallbackColor ?? t.colors.surface },
        fallbackHairline && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: t.colors.border,
        },
      ]}
    >
      {children}
    </View>
  )
}
