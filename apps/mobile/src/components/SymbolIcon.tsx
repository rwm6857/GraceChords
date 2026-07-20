import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols'
import { Platform, Text, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { MATERIAL_CODEPOINTS, SF_TO_MATERIAL } from './symbolMap'

// Thin wrapper over the platform icon system. Per the design non-negotiables,
// all iconography comes from a native design-system font — no hand-drawn/SVG
// glyphs. On iOS/iPadOS that means SF Symbols (via expo-symbols' SymbolView);
// on Android it means Material Symbols, rendered from the subset fonts bundled
// in assets/fonts and registered in app/_layout.tsx.
//
// Call sites are identical on both platforms: they pass a single SF Symbol
// `name`. The Android branch looks that name up in symbolMap.ts (the single
// source of truth) and renders the mapped Material glyph — so the ~46 call
// sites never learn there are two icon sets. `md` is an optional per-call-site
// override for the handful of icons whose auto-mapping is ambiguous; iOS
// ignores it.

export type SymbolIconProps = {
  name: SymbolViewProps['name']
  size?: number
  color?: string
  weight?: SymbolWeight
  style?: StyleProp<ViewStyle>
  /**
   * Android only: force a specific Material Symbols glyph instead of the one
   * symbolMap.ts derives from `name`. Must be a glyph bundled in the subset
   * fonts (i.e. present in MATERIAL_CODEPOINTS). Ignored on iOS.
   */
  md?: string
}

// De-dupe the dev warning so a missing mapping logs once per name, not per frame.
const warnedNames = new Set<string>()

// The Android glyph. Material Symbols ship as a variable font whose FILL/weight
// axes React Native cannot drive at runtime, so we bundle two instanced faces
// (FILL=0 / FILL=1) and pick between them here. `weight` has no Android analog
// — the faces are fixed at wght=400 (the standard Material bar weight) — so it
// is intentionally not forwarded (fake-bolding an icon font distorts glyphs).
function MaterialGlyph({
  name,
  md,
  size,
  color,
  style,
}: {
  name: string
  md?: string
  size: number
  color?: string
  style?: StyleProp<ViewStyle>
}) {
  const entry = SF_TO_MATERIAL[name]
  const mdName = md ?? entry?.md
  const codepoint = mdName ? MATERIAL_CODEPOINTS[mdName] : undefined

  if (codepoint == null) {
    if (__DEV__ && !warnedNames.has(name)) {
      warnedNames.add(name)
      console.warn(
        `[SymbolIcon] No Material Symbols mapping for "${name}"` +
          (md ? ` (md="${md}")` : '') +
          '; add it to symbolMap.ts and rebuild the fonts. Rendering a fallback.',
      )
    }
    // Fallback: the outlined "help" glyph, so a missing mapping is visible in
    // dev without crashing or leaving a blank hole in the layout.
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: 'MaterialSymbolsOutlined',
            fontSize: size,
            lineHeight: size,
            color,
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
          }}
        >
          {String.fromCodePoint(MATERIAL_CODEPOINTS.help)}
        </Text>
      </View>
    )
  }

  const filled = entry?.filled ?? /\.fill$/.test(name)
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: filled ? 'MaterialSymbolsFilled' : 'MaterialSymbolsOutlined',
          fontSize: size,
          lineHeight: size,
          color,
          textAlign: 'center',
          textAlignVertical: 'center',
          includeFontPadding: false,
        }}
      >
        {String.fromCodePoint(codepoint)}
      </Text>
    </View>
  )
}

export default function SymbolIcon({
  name,
  size = 24,
  color,
  weight = 'regular',
  style,
  md,
}: SymbolIconProps) {
  if (Platform.OS === 'android') {
    return <MaterialGlyph name={name as string} md={md} size={size} color={color} style={style} />
  }
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  )
}
