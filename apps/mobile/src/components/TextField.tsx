import { useState, type ReactNode } from 'react'
import {
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/ThemeProvider'
import SymbolIcon, { type SymbolIconProps } from './SymbolIcon'

// Themed form input per the auth design: 52px field, radius 12, leading
// SF Symbol, label row with an optional right-aligned accessory (e.g. the
// "Forgot?" link), and a built-in show/hide eye toggle for secure entry.

export type TextFieldProps = {
  label: string
  icon: SymbolIconProps['name']
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  labelAccessory?: ReactNode
  helperText?: string
  keyboardType?: KeyboardTypeOptions
  autoCapitalize?: 'none' | 'words'
  autoComplete?: TextInputProps['autoComplete']
  textContentType?: TextInputProps['textContentType']
  style?: StyleProp<ViewStyle>
}

export default function TextField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  labelAccessory,
  helperText,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  style,
}: TextFieldProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('common')
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)

  return (
    <View style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: t.spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: '600',
            letterSpacing: -0.1,
            color: t.colors.sec,
          }}
        >
          {label}
        </Text>
        {labelAccessory}
      </View>
      <View
        style={{
          height: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm + 2,
          paddingHorizontal: t.spacing.md + 2,
          borderRadius: t.radii.md,
          backgroundColor: t.colors.surface,
          borderWidth: 1,
          borderColor: focused ? t.colors.accent : t.colors.border,
        }}
      >
        <SymbolIcon name={icon} size={18} color={t.colors.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.colors.muted}
          secureTextEntry={secureTextEntry && !revealed}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            height: '100%',
            fontSize: t.typography.body.fontSize,
            color: t.colors.ink,
            paddingVertical: 0,
          }}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? tx('hidePassword') : tx('showPassword')}
            hitSlop={8}
          >
            <SymbolIcon name={revealed ? 'eye.slash' : 'eye'} size={18} color={t.colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {helperText ? (
        <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: t.spacing.xs + 2 }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  )
}
