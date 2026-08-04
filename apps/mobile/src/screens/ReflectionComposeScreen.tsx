import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatPassageLabel } from '@gracechords/core'
import Screen from '../components/Screen'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../lib/bibleSource'
import {
  DuplicateReflectionError,
  reflectionDateKey,
  useTodayReflection,
} from '../lib/useReflections'
import { errMessage } from '../lib/errors'

// The reflection composer. A full pushed screen (not a formSheet) to give the
// up-to-2000-char editor room and a comfortable keyboard. It covers two flows
// via route params:
//   * create — the default; Save writes the day's reflection, or updates
//     today's existing entry in place if one already resolved.
//   * edit   — editId + initialBody; Save updates that existing row in place.
// One reflection per day is enforced by the DB unique index; a duplicate is
// surfaced gracefully.
//
// Reflections are PRIVATE-ONLY. There is deliberately no visibility control and
// no `visibility` route param: the composer cannot be switched into a public
// mode by any caller, deep link, or parameter. createReflection() in core hard-
// codes visibility='private', and the only other writer (updateReflection) is
// RLS-scoped to the owner's own private rows.

const MAX_BODY = 2000

/** Parse a YYYY-MM-DD key into a LOCAL Date (avoids UTC day-shift). */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => Number(n))
  return new Date(y, (m || 1) - 1, d || 1)
}

export default function ReflectionComposeScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation('reader')
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    editId?: string
    initialBody?: string
    date?: string
  }>()

  const editId = typeof params.editId === 'string' && params.editId ? params.editId : null
  const isEditing = editId !== null
  const dateKey =
    typeof params.date === 'string' && params.date ? params.date : reflectionDateKey(new Date())

  const { reflection: existingPrivate, create, update } = useTodayReflection(dateKey)

  // Edit mode (reached via editId) has its own body — just the one row being
  // edited.
  const [editBody, setEditBody] = useState(
    typeof params.initialBody === 'string' ? params.initialBody : '',
  )
  const [saving, setSaving] = useState(false)

  // Create-mode draft, hydrated once the first time today's existing entry
  // resolves, so opening the composer on a day already written shows that text
  // instead of a blank box.
  const [privateBody, setPrivateBody] = useState('')
  const privateHydrated = useRef(false)

  useEffect(() => {
    if (isEditing || privateHydrated.current || !existingPrivate) return
    privateHydrated.current = true
    setPrivateBody(existingPrivate.body)
  }, [isEditing, existingPrivate])

  const body = isEditing ? editBody : privateBody
  const setBody = (v: string) => {
    const next = v.slice(0, MAX_BODY)
    if (isEditing) setEditBody(next)
    else setPrivateBody(next)
  }

  const composeDate = useMemo(() => dateFromKey(dateKey), [dateKey])
  const dateLabel = composeDate.toLocaleDateString(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const passages = useMemo(
    () => expandReadings(getPlanForDate(composeDate).readings).map(formatPassageLabel).join(' · '),
    [dateKey], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const isEditingPrivateInPlace = !isEditing && !!existingPrivate
  const trimmed = body.trim()
  const canAct = trimmed.length > 0 && trimmed.length <= MAX_BODY && !saving

  const title =
    isEditing || isEditingPrivateInPlace
      ? tx('reflection.editTitle')
      : tx('reflection.composeTitle')
  const actionLabel = tx('reflection.save')

  // ── Save an edit to an existing private reflection ──────────────────────────
  const onUpdate = async () => {
    if (!editId) return
    setSaving(true)
    try {
      await update(editId, trimmed)
      router.back()
    } catch (err: unknown) {
      setSaving(false)
      Alert.alert(tx('reflection.editErrorTitle'), errMessage(err))
    }
  }

  // ── Save the private side: update today's existing entry in place if the
  // toggle loaded one, otherwise create a fresh one ───────────────────────────
  const onSavePrivate = async () => {
    setSaving(true)
    try {
      if (existingPrivate) {
        await update(existingPrivate.id, trimmed)
      } else {
        await create(trimmed)
      }
      router.back()
    } catch (err: unknown) {
      setSaving(false)
      if (!existingPrivate && err instanceof DuplicateReflectionError) {
        Alert.alert(tx('reflection.duplicateTitle'), tx('reflection.duplicateMessage'), [
          { text: tx('reflection.ok'), onPress: () => router.back() },
        ])
        return
      }
      Alert.alert(tx('reflection.saveErrorTitle'), errMessage(err))
    }
  }

  const onAction = () => {
    if (!canAct) return
    if (isEditing) return void onUpdate()
    return void onSavePrivate()
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Header: cancel + title + save/share */}
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
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>{title}</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          {saving ? (
            <ActivityIndicator color={t.colors.accent} />
          ) : (
            <Pressable onPress={onAction} disabled={!canAct} accessibilityRole="button" hitSlop={8}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: canAct ? t.colors.accent : t.colors.muted,
                }}
              >
                {actionLabel}
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
            onChangeText={setBody}
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
