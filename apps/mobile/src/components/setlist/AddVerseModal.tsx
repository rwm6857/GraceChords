import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { parseVerseReference } from '@gracechords/core'
import { useTheme } from '../../theme/ThemeProvider'
import { useBibleTranslations } from '../../lib/useBibleTranslations'

// "Add a verse" authoring sheet: a reference input + a translation picker fed by
// the R2 manifest (only translations actually present are offered). On confirm it
// parses the reference against the chosen translation and hands the canonical
// `v:...` id back to the builder. The translation is chosen HERE, at authoring
// time, and travels inside the verse id.
export default function AddVerseModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean
  onClose: () => void
  onAdd: (verseId: string) => void
}) {
  const t = useTheme()
  const { t: tx } = useTranslation(['setlist', 'common'])
  const insets = useSafeAreaInsets()
  const { translations, defaultTranslationId } = useBibleTranslations()

  const [ref, setRef] = useState('')
  const [translationId, setTranslationId] = useState(defaultTranslationId)
  const [error, setError] = useState<string | null>(null)

  // Seed / reset the selected translation when the manifest resolves or the
  // sheet re-opens.
  useEffect(() => {
    if (visible) {
      setTranslationId(defaultTranslationId)
      setRef('')
      setError(null)
    }
  }, [visible, defaultTranslationId])

  const canAdd = useMemo(() => ref.trim().length > 0, [ref])

  const submit = () => {
    const parsed = parseVerseReference(ref, { translation: translationId })
    if (!parsed || parsed.error || !parsed.id) {
      setError(tx('setlist:verse.invalid'))
      return
    }
    onAdd(parsed.id)
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.sm,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
            {tx('setlist:verse.title')}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tx('common:cancel')} hitSlop={8}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.textAccent }}>{tx('common:cancel')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <View>
            <TextInput
              value={ref}
              onChangeText={(v) => { setRef(v); if (error) setError(null) }}
              placeholder={tx('setlist:verse.placeholder')}
              placeholderTextColor={t.colors.muted}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={submit}
              style={{
                borderWidth: 1,
                borderColor: t.colors.border,
                borderRadius: t.radii.md,
                paddingHorizontal: t.spacing.md,
                paddingVertical: t.spacing.sm,
                fontSize: 17,
                color: t.colors.ink,
                backgroundColor: t.colors.surface,
              }}
            />
            {error ? (
              <Text style={{ marginTop: 6, color: t.colors.danger ?? '#c0392b', fontSize: 13.5 }}>{error}</Text>
            ) : null}
          </View>

          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.sec, marginBottom: t.spacing.sm }}>
              {tx('setlist:verse.translation')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {translations.map((tr) => {
                const selected = tr.id === translationId
                return (
                  <Pressable
                    key={tr.id}
                    onPress={() => setTranslationId(tr.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: t.radii.pill,
                      backgroundColor: selected ? t.colors.accent : t.colors.surfaceAlt,
                    }}
                  >
                    <Text style={{ fontWeight: '700', color: selected ? t.colors.onAccent : t.colors.ink }}>
                      {tr.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <Pressable
            onPress={submit}
            disabled={!canAdd}
            accessibilityRole="button"
            style={{
              marginTop: t.spacing.md,
              alignSelf: 'flex-start',
              backgroundColor: t.colors.accent,
              borderRadius: t.radii.pill,
              paddingHorizontal: 22,
              paddingVertical: 12,
              opacity: canAdd ? 1 : 0.5,
            }}
          >
            <Text style={{ color: t.colors.onAccent, fontWeight: '700' }}>{tx('setlist:verse.confirm')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}
