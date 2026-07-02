import { useEffect, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../theme/ThemeProvider'
import SymbolIcon from '../components/SymbolIcon'
import { supabase } from '../lib/supabase'
import { SPRITE_IDS, SPRITE_SOURCES, type SpriteId } from '../lib/sprites'
import { saveSpritePreference, stashPendingSprite } from '../lib/profile'
import { setLocalSprite, useProfileSprite } from '../lib/useProfileSprite'

// Avatar picker. Two modes:
//  - onboarding (default): post-signup "Choose your icon" step. The pick is
//    written to users.preferences.sprite; with email confirmation pending there
//    is no session yet, so the pick is stashed in AsyncStorage and flushed by
//    the root layout on the first SIGNED_IN event. The step is optional.
//  - edit (mode=edit, from Settings → Profile for an existing account):
//    "Change your icon", preselects the current sprite, Save-and-return, no skip.

export default function SpritePickerScreen() {
  const t = useTheme()
  const router = useRouter()
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const isEdit = mode === 'edit'
  const { width } = useWindowDimensions()
  const { spriteId: currentSprite } = useProfileSprite()
  const [selected, setSelected] = useState<SpriteId | null>(null)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  // In edit mode, preselect the account's current sprite until the user taps a
  // different tile — so the grid shows what's set and Save is meaningful.
  useEffect(() => {
    if (isEdit && !touched && currentSprite) setSelected(currentSprite)
  }, [isEdit, touched, currentSprite])

  const gridGap = t.spacing.lg
  const tileSize = (width - t.spacing.lg * 2 - gridGap * 2) / 3

  async function finish(sprite: SpriteId | null) {
    setBusy(true)
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      if (sprite) {
        const { error } = await saveSpritePreference(supabase, data.session.user.id, sprite)
        if (error) await stashPendingSprite(AsyncStorage, sprite)
        else setLocalSprite(sprite) // reflect the new avatar everywhere at once
      }
      // Edit came from Settings — return there; onboarding enters the app.
      if (isEdit) router.back()
      else router.replace('/')
    } else {
      if (sprite) await stashPendingSprite(AsyncStorage, sprite)
      Alert.alert('Check your email', 'Confirm your account, then sign in.')
      router.replace('/login')
    }
    setBusy(false)
  }

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xs,
          alignSelf: 'flex-start',
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.sm,
        }}
      >
        <SymbolIcon name="chevron.left" size={16} color={t.colors.textAccent} weight="semibold" />
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.textAccent }}>Back</Text>
      </Pressable>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xl }}
      >
        <Text
          style={{
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            letterSpacing: -0.4,
            color: t.colors.ink,
            marginTop: t.spacing.md,
          }}
        >
          {isEdit ? 'Change your icon' : 'Choose your icon'}
        </Text>
        {isEdit ? null : (
          <Text style={{ fontSize: 15, color: t.colors.sec, marginTop: t.spacing.xs }}>
            You can change this later
          </Text>
        )}

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: gridGap,
            marginTop: t.spacing.xl,
          }}
        >
          {SPRITE_IDS.map((id) => {
            const isSelected = selected === id
            return (
              <Pressable
                key={id}
                onPress={() => {
                  setSelected(id)
                  setTouched(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={id}
                accessibilityState={{ selected: isSelected }}
                style={{ width: tileSize, height: tileSize }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: t.radii.pill,
                    overflow: 'hidden',
                    borderWidth: isSelected ? 3 : 0,
                    borderColor: t.colors.accent,
                  }}
                >
                  <Image
                    source={SPRITE_SOURCES[id]}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
                {isSelected ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: 2,
                      bottom: 2,
                      width: 24,
                      height: 24,
                      borderRadius: t.radii.pill,
                      backgroundColor: t.colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: t.colors.bg,
                    }}
                  >
                    <SymbolIcon name="checkmark" size={12} color={t.colors.onAccent} weight="bold" />
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: t.spacing.lg, gap: t.spacing.sm }}>
        <Pressable
          onPress={() => finish(selected)}
          disabled={busy || !selected}
          accessibilityRole="button"
          style={({ pressed }) => ({
            height: 50,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.sm,
            opacity: busy || !selected ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 16.5, fontWeight: '700', color: t.colors.onAccent }}>
            {isEdit ? 'Save' : 'Continue'}
          </Text>
          {isEdit ? null : (
            <SymbolIcon name="chevron.right" size={13} color={t.colors.onAccent} weight="semibold" />
          )}
        </Pressable>
        {isEdit ? null : (
          <Pressable
            onPress={() => finish(null)}
            disabled={busy}
            accessibilityRole="button"
            hitSlop={4}
            style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.muted }}>
              Skip for now
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
