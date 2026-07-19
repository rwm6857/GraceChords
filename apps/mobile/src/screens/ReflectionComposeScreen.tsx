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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatPassageLabel } from '@gracechords/core'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import UgcTermsSheet from '../components/reflections/UgcTermsSheet'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../lib/bibleSource'
import {
  DuplicateReflectionError,
  reflectionDateKey,
  useTodayReflection,
} from '../lib/useReflections'
import { submitPublicReflection } from '../lib/reflectionsApi'
import { useUgcAccepted } from '../lib/ugc'
import { errMessage } from '../lib/errors'

// The single reflection composer. A full pushed screen (not a formSheet) to give
// the up-to-2000-char editor room and a comfortable keyboard. It covers three
// flows via route params:
//   * create private  — the default; Save writes a private reflection.
//   * create shared   — visibility=public; a Private/Shared toggle lets the user
//     switch. Sharing runs the moderated submit path (UGC terms gate for a
//     first-time sharer, an explicit confirm for a returning one), so nothing
//     posts publicly without a deliberate confirm.
//   * edit private    — editId + initialBody; Save updates the existing PRIVATE
//     row in place. Public posts are immutable, so edit mode is private-only and
//     the visibility toggle is hidden.
// One reflection per visibility per day is enforced by the DB unique index; a
// duplicate is surfaced gracefully.

const MAX_BODY = 2000

type Visibility = 'private' | 'public'

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
    visibility?: string
    date?: string
  }>()

  const editId = typeof params.editId === 'string' && params.editId ? params.editId : null
  const isEditing = editId !== null
  const dateKey =
    typeof params.date === 'string' && params.date ? params.date : reflectionDateKey(new Date())

  const { create, update } = useTodayReflection(dateKey)
  const ugc = useUgcAccepted()

  const [body, setBody] = useState(
    typeof params.initialBody === 'string' ? params.initialBody : '',
  )
  // Editing is private-only (public posts are immutable), so the toggle is hidden
  // and pinned to private; creation honors the requested initial visibility.
  const [visibility, setVisibility] = useState<Visibility>(
    !isEditing && params.visibility === 'public' ? 'public' : 'private',
  )
  const [saving, setSaving] = useState(false)
  const [ugcVisible, setUgcVisible] = useState(false)

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

  const isPublic = !isEditing && visibility === 'public'
  const trimmed = body.trim()
  const canAct = trimmed.length > 0 && trimmed.length <= MAX_BODY && !saving && (!isPublic || ugc.ready)

  const title = isEditing
    ? tx('reflection.editTitle')
    : isPublic
      ? tx('publicCompose.title')
      : tx('reflection.composeTitle')
  const actionLabel = isPublic ? tx('publicCompose.share') : tx('reflection.save')

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

  // ── Create a new private reflection ─────────────────────────────────────────
  const onSavePrivate = async () => {
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

  // ── Create a shared (public) reflection through the moderated submit path ────
  const doSubmit = async () => {
    setSaving(true)
    try {
      const result = await submitPublicReflection({
        body: trimmed,
        reflectionDate: reflectionDateKey(new Date()),
      })
      setSaving(false)
      switch (result.status) {
        case 'posted':
          router.back()
          return
        case 'already_posted':
          Alert.alert(tx('publicCompose.alreadyTitle'), tx('publicCompose.alreadyMessage'), [
            { text: tx('reflection.ok'), onPress: () => router.back() },
          ])
          return
        case 'rejected':
          Alert.alert(tx('publicCompose.rejectedTitle'), tx('publicCompose.rejectedMessage'))
          return
        case 'disabled':
          Alert.alert(tx('publicCompose.unavailableTitle'), tx('publicCompose.unavailableMessage'), [
            { text: tx('reflection.ok'), onPress: () => router.back() },
          ])
          return
        case 'banned':
          Alert.alert(tx('publicCompose.unavailableTitle'), tx('publicCompose.bannedMessage'), [
            { text: tx('reflection.ok'), onPress: () => router.back() },
          ])
          return
        case 'unavailable':
          Alert.alert(tx('publicCompose.moderationRetryTitle'), tx('publicCompose.moderationRetryMessage'))
          return
      }
    } catch (err: unknown) {
      setSaving(false)
      Alert.alert(tx('publicCompose.moderationRetryTitle'), errMessage(err))
    }
  }

  const onShare = () => {
    if (!ugc.accepted) {
      setUgcVisible(true) // first-time sharer → terms gate (Agree & Share = confirm)
      return
    }
    // Returning sharer → explicit confirm before posting publicly.
    Alert.alert(tx('publicCompose.confirmTitle'), tx('publicCompose.confirmMessage'), [
      { text: tx('publicCompose.cancel'), style: 'cancel' },
      { text: tx('publicCompose.confirmShare'), onPress: () => void doSubmit() },
    ])
  }

  // Fired after the UGC sheet records acceptance — it IS the confirm, so post.
  const onAgreed = () => {
    ugc.markAccepted()
    setUgcVisible(false)
    void doSubmit()
  }

  const onAction = () => {
    if (!canAct) return
    if (isEditing) return void onUpdate()
    if (isPublic) return onShare()
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {isPublic ? (
            <SymbolIcon name="person.2.fill" size={14} color={t.colors.textAccent} />
          ) : null}
          <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>{title}</Text>
        </View>
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

          {/* Private/Shared toggle — creation only (edits stay private). */}
          {!isEditing ? (
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: t.colors.surfaceAlt,
                borderRadius: t.radii.md,
                padding: 3,
                marginTop: t.spacing.lg,
              }}
            >
              {(['private', 'public'] as const).map((v) => {
                const active = visibility === v
                return (
                  <Pressable
                    key={v}
                    onPress={() => setVisibility(v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: t.radii.sm,
                      backgroundColor: active ? t.colors.surface : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: active ? t.colors.ink : t.colors.muted,
                      }}
                    >
                      {v === 'private' ? tx('journal.privateLabel') : tx('journal.sharedLabel')}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {/* Public banner — only when sharing. */}
          {isPublic ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: t.colors.accentSoft,
                borderRadius: t.radii.sm,
                paddingVertical: 8,
                paddingHorizontal: t.spacing.md,
                marginTop: t.spacing.md,
              }}
            >
              <SymbolIcon name="eye" size={14} color={t.colors.textAccent} />
              <Text style={{ flex: 1, fontSize: 12.5, color: t.colors.textAccent }}>
                {tx('publicCompose.banner')}
              </Text>
            </View>
          ) : null}

          <TextInput
            value={body}
            onChangeText={(v) => setBody(v.slice(0, MAX_BODY))}
            placeholder={isPublic ? tx('publicCompose.placeholder') : tx('reflection.placeholder')}
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

      <UgcTermsSheet visible={ugcVisible} onClose={() => setUgcVisible(false)} onAgreed={onAgreed} />
    </Screen>
  )
}
