import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatPassageLabel } from '@gracechords/core'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../lib/bibleSource'
import { DuplicateReflectionError, useTodayReflection } from '../lib/useReflections'
import { errMessage } from '../lib/errors'

// Compose today's reflection. A full pushed screen (not a formSheet) to give the
// up-to-2000-char editor room and a comfortable keyboard. Save creates a private
// reflection and returns to the landing; a second reflection for the same day is
// blocked gracefully (the DB unique index). There is no edit mode — an existing
// day's reflection is deleted and re-created, never edited.

const MAX_BODY = 2000

export default function ReflectionComposeScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation('reader')
  const insets = useSafeAreaInsets()
  const { create } = useTodayReflection()

  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const today = new Date()
  const dateLabel = today.toLocaleDateString(i18n.language, { weekday: 'long', month: 'long', day: 'numeric' })
  const passages = useMemo(
    () => expandReadings(getPlanForDate(new Date()).readings).map(formatPassageLabel).join(' · '),
    [],
  )

  const trimmed = body.trim()
  const canSave = trimmed.length > 0 && trimmed.length <= MAX_BODY && !saving

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await create(trimmed)
      router.back()
    } catch (err: unknown) {
      setSaving(false)
      if (err instanceof DuplicateReflectionError) {
        Alert.alert(tx('reflection.duplicateTitle'), tx('reflection.duplicateMessage'), [
          { text: tx('reflection.ok'), onPress: () => router.back() },
        ])
        return
      }
      Alert.alert(tx('reflection.saveErrorTitle'), errMessage(err))
    }
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Header: cancel + title + save */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tx('reflection.cancel')}
          hitSlop={8}
          style={{ flex: 1 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>
            {tx('reflection.cancel')}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>
          {tx('reflection.composeTitle')}
        </Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          {saving ? (
            <ActivityIndicator color={t.colors.accent} />
          ) : (
            <Pressable onPress={onSave} disabled={!canSave} accessibilityRole="button" hitSlop={8}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: canSave ? t.colors.accent : t.colors.muted,
                }}
              >
                {tx('reflection.save')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.xs,
            paddingBottom: insets.bottom + t.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.colors.sec }}>{dateLabel}</Text>
          {passages ? (
            <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 2 }}>{passages}</Text>
          ) : null}

          <TextInput
            value={body}
            onChangeText={(v) => setBody(v.slice(0, MAX_BODY))}
            placeholder={tx('reflection.placeholder')}
            placeholderTextColor={t.colors.muted}
            multiline
            autoFocus
            textAlignVertical="top"
            maxLength={MAX_BODY}
            style={{
              marginTop: t.spacing.lg,
              minHeight: 220,
              fontFamily: 'Georgia',
              fontSize: 16,
              lineHeight: 25,
              color: t.colors.ink,
            }}
          />

          <Text style={{ marginTop: t.spacing.sm, fontSize: 12, color: t.colors.muted, textAlign: 'right' }}>
            {tx('reflection.charCount', { count: body.length, max: MAX_BODY })}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}
