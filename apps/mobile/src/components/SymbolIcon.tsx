import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols'
import type { StyleProp, ViewStyle } from 'react-native'

// Thin wrapper over expo-symbols' SymbolView. Per the design non-negotiables,
// all iconography is SF Symbols (no hand-drawn/SVG glyphs). SF Symbols render on
// iOS/iPadOS only, which is the target for this stage.

export type SymbolIconProps = {
  name: SymbolViewProps['name']
  size?: number
  color?: string
  weight?: SymbolWeight
  style?: StyleProp<ViewStyle>
}

export default function SymbolIcon({
  name,
  size = 24,
  color,
  weight = 'regular',
  style,
}: SymbolIconProps) {
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
