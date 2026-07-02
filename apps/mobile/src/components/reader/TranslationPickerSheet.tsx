import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  isRtlBibleLanguage,
  translationOptionLabel,
  type BibleTranslation,
  type BibleTranslationGroup,
} from '@gracechords/core'
import BottomSheet from '../BottomSheet'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'

// Translation picker (Daily Word). Grouped by language; the active translation
// carries a checkmark and accent text. RTL languages (e.g. Arabic) right-align
// their rows. Offline download state is out of scope this pass — selection only.

export default function TranslationPickerSheet({
  visible,
  onClose,
  groups,
  selectedId,
  onSelect,
}: {
  visible: boolean
  onClose: () => void
  groups: BibleTranslationGroup[]
  selectedId: string
  onSelect: (translation: BibleTranslation) => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Translation">
      <ScrollView
        style={{ maxHeight: 440 }}
        contentContainerStyle={{ paddingBottom: t.spacing.md + insets.bottom, paddingTop: t.spacing.xs }}
      >
        {groups.map((group) => (
          <View key={group.languageCode}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: t.colors.muted,
                paddingHorizontal: t.spacing.lg,
                paddingTop: t.spacing.md,
                paddingBottom: t.spacing.xs,
              }}
            >
              {group.languageLabel}
            </Text>
            {group.translations.map((item) => {
              const selected = item.id === selectedId
              const rtl = isRtlBibleLanguage(item.language)
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onSelect(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({
                    flexDirection: rtl ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    paddingHorizontal: t.spacing.lg,
                    paddingVertical: t.spacing.md,
                    backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
                  })}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 16,
                      letterSpacing: -0.2,
                      textAlign: rtl ? 'right' : 'left',
                      writingDirection: rtl ? 'rtl' : 'ltr',
                      color: selected ? t.colors.textAccent : t.colors.ink,
                      fontWeight: selected ? '700' : '400',
                    }}
                  >
                    {translationOptionLabel(item)}
                  </Text>
                  {selected ? (
                    <SymbolIcon name="checkmark" size={18} color={t.colors.accent} weight="bold" />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  )
}
