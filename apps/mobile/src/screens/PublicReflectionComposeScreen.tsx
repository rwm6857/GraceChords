import { useState } from 'react'
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
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import UgcTermsSheet from '../components/reflections/UgcTermsSheet'
import { useTheme } from '../theme/ThemeProvider'
import { reflectionDateKey } from '../lib/useReflections'
import { submitPublicReflection } from '../lib/reflectionsApi'
import { useUgcAccepted } from '../lib/ugc'
import { errMessage } from '../lib/errors'

// Compose a PUBLIC (Shared) reflection — a full pushed screen, distinct from the
// private composer (accent framing, its own title/route). "Share" gates on UGC
// acceptance for a first-time sharer (the terms sheet's "Agree & Share" is the
// explicit confirm) and shows a plain confirm for returning sharers, so nothing
// posts publicly without an explicit confirm. Submits through the moderated 2A
// endpoint; every non-posted outcome leaves no row and a friendly message.

const MAX_BODY = 2000

export default function PublicReflectionComposeScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx } = useTranslation('reader')
  const insets = useSafeAreaInsets()
  const ugc = useUgcAccepted()

  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [ugcVisible, setUgcVisible] = useState(false)

  const trimmed = body.trim()
  const canShare = trimmed.length > 0 && trimmed.length <= MAX_BODY && !saving && ugc.ready

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
    if (!canShare) return
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

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Header: cancel + title + share */}
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
          accessibilityLabel={tx('publicCompose.cancel')}
          hitSlop={8}
          style={{ flex: 1 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>
            {tx('publicCompose.cancel')}
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SymbolIcon name="person.2.fill" size={14} color={t.colors.textAccent} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>
            {tx('publicCompose.title')}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          {saving ? (
            <ActivityIndicator color={t.colors.accent} />
          ) : (
            <Pressable onPress={onShare} disabled={!canShare} accessibilityRole="button" hitSlop={8}>
              <Text
                style={{ fontSize: 16, fontWeight: '700', color: canShare ? t.colors.accent : t.colors.muted }}
              >
                {tx('publicCompose.share')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.xs,
            paddingBottom: insets.bottom + t.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: t.colors.accentSoft,
              borderRadius: t.radii.sm,
              paddingVertical: 8,
              paddingHorizontal: t.spacing.md,
            }}
          >
            <SymbolIcon name="eye" size={14} color={t.colors.textAccent} />
            <Text style={{ flex: 1, fontSize: 12.5, color: t.colors.textAccent }}>
              {tx('publicCompose.banner')}
            </Text>
          </View>

          <TextInput
            value={body}
            onChangeText={(v) => setBody(v.slice(0, MAX_BODY))}
            placeholder={tx('publicCompose.placeholder')}
            placeholderTextColor={t.colors.muted}
            multiline
            autoFocus
            textAlignVertical="top"
            maxLength={MAX_BODY}
            style={{
              marginTop: t.spacing.lg,
              minHeight: 200,
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
