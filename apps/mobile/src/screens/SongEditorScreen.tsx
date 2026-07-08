import { useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import {
  CHROMATIC_KEYS,
  TIME_SIGNATURES,
  LANGUAGE_OPTIONS,
  SECTION_PRESETS,
  getDiatonicChords,
  insertAtCursor,
  wrapSection,
  chordInsertToken,
  parseChordProOrLegacy,
  type SongDoc,
} from '@gracechords/core'
import Screen from '../components/Screen'
import Button from '../components/Button'
import SymbolIcon from '../components/SymbolIcon'
import ChordChart from '../components/ChordChart'
import { useTheme } from '../theme/ThemeProvider'
import { useSongDraft } from '../lib/useSongDraft'
import { useUserRole } from '../lib/useUserRole'

// Mobile song editor at parity with the web editor: metadata fields + a ChordPro
// body with chord/section insert bars (both driven by the shared core helpers,
// so the two apps produce identical output) + a live preview + role-aware
// actions (Save draft, Submit for review, or Publish for editor+).
export default function SongEditorScreen() {
  const t = useTheme()
  const router = useRouter()
  const { draftId } = useLocalSearchParams<{ draftId: string }>()
  const { role } = useUserRole()
  const draft = useSongDraft(draftId as string, role)
  const { form, setField, errors, hasErrors, busy, canPublish } = draft

  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [tagInput, setTagInput] = useState('')
  const [selection, setSelection] = useState({ start: 0, end: 0 })

  const diatonic = useMemo(
    () => (getDiatonicChords(form.default_key) ?? []) as Array<{ symbol: string; display: string; degree: string }>,
    [form.default_key],
  )

  const previewDoc = useMemo<SongDoc | null>(() => {
    if (mode !== 'preview' || !form.chordpro_content.trim()) return null
    try {
      return parseChordProOrLegacy(form.chordpro_content)
    } catch {
      return null
    }
  }, [mode, form.chordpro_content])

  function applyBody(next: { value: string; selection: { start: number; end: number } }) {
    setField('chordpro_content', next.value)
    setSelection(next.selection)
  }

  function insertChord(symbol: string) {
    applyBody(insertAtCursor(form.chordpro_content, selection, chordInsertToken(symbol)))
  }

  function insertSection(directive: string, label: string) {
    applyBody(wrapSection(form.chordpro_content, selection, { directive, label }))
  }

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,/g, '').trim()
    if (!tag) return
    if (!form.tags.includes(tag)) setField('tags', [...form.tags, tag])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setField(
      'tags',
      form.tags.filter((x) => x !== tag),
    )
  }

  async function run(action: () => Promise<unknown>, successMsg: string) {
    try {
      await action()
      Alert.alert('Done', successMsg)
      router.back()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err))
    }
  }

  const primaryLabel = canPublish ? 'Publish' : 'Submit for review'
  const primaryAction = canPublish
    ? () => run(draft.publish, 'Song published.')
    : () => run(draft.submitForReview, 'Submitted for review.')

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

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
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontSize: 16, color: t.colors.accent }}>Cancel</Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.ink }}>
          {form.title || 'New Song'}
        </Text>
        <Pressable
          onPress={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={{ fontSize: 16, color: t.colors.accent }}>
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </Text>
        </Pressable>
      </View>

      {mode === 'preview' ? (
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg }}>
          {previewDoc ? (
            <ChordChart doc={previewDoc} steps={0} preferFlat={false} />
          ) : (
            <Text style={{ color: t.colors.muted }}>Nothing to preview yet.</Text>
          )}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            <Field label="Title" error={errors.title}>
              <PlainInput value={form.title} onChangeText={(v) => setField('title', v)} placeholder="Song title" />
            </Field>

            <Field label="Key" error={errors.default_key}>
              <ChipRow
                options={CHROMATIC_KEYS}
                selected={form.default_key}
                onSelect={(v) => setField('default_key', v)}
              />
            </Field>

            <Field label="Artist">
              <PlainInput value={form.artist} onChangeText={(v) => setField('artist', v)} placeholder="Artist / composer" />
            </Field>

            <Field label="Tags" error={errors.tags}>
              <PlainInput
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={() => addTag(tagInput)}
                placeholder="Type a tag and press return"
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {form.tags.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => removeTag(tag)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: t.radii.pill,
                      backgroundColor: t.colors.accentSoft,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: t.colors.textAccent }}>{tag}</Text>
                    <SymbolIcon name="xmark" size={10} color={t.colors.textAccent} />
                  </Pressable>
                ))}
              </View>
            </Field>

            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Time signature">
                  <ChipRow
                    options={TIME_SIGNATURES}
                    selected={form.time_signature}
                    onSelect={(v) => setField('time_signature', v)}
                  />
                </Field>
              </View>
              <View style={{ width: 110 }}>
                <Field label="Tempo">
                  <PlainInput
                    value={form.tempo ? String(form.tempo) : ''}
                    onChangeText={(v) => setField('tempo', v ? parseInt(v, 10) || '' : '')}
                    placeholder="BPM"
                    keyboardType="number-pad"
                  />
                </Field>
              </View>
            </View>

            <Field label="Language">
              <ChipRow
                options={LANGUAGE_OPTIONS.filter(Boolean)}
                selected={form.language}
                onSelect={(v) => setField('language', form.language === v ? '' : v)}
              />
            </Field>

            <Field label="Country">
              <PlainInput value={form.country} onChangeText={(v) => setField('country', v)} placeholder="e.g. USA" />
            </Field>

            <Field label="YouTube ID or URL">
              <PlainInput value={form.youtube_id} onChangeText={(v) => setField('youtube_id', v)} placeholder="dQw4w9WgXcQ" />
            </Field>

            {/* ChordPro body + insert bars */}
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.colors.sec, marginTop: t.spacing.md, marginBottom: t.spacing.sm }}>
              Chart (ChordPro)
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {SECTION_PRESETS.map((p) => (
                  <BarButton key={p.label} label={p.label} onPress={() => insertSection(p.directive, p.sectionLabel)} />
                ))}
              </View>
            </ScrollView>

            {diatonic.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {diatonic.map((c) => (
                    <BarButton key={c.symbol} label={c.display} onPress={() => insertChord(c.symbol)} accent />
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text style={{ fontSize: 12.5, color: t.colors.muted, marginBottom: 8 }}>
                Set a key to enable quick chords.
              </Text>
            )}

            <TextInput
              value={form.chordpro_content}
              onChangeText={(v) => setField('chordpro_content', v)}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
              selection={selection}
              multiline
              placeholder={'{start_of_verse: Verse 1}\n[G]Amazing [D]grace\n{end_of_verse}'}
              placeholderTextColor={t.colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                minHeight: 220,
                borderWidth: 1,
                borderColor: t.colors.border,
                borderRadius: t.radii.md,
                backgroundColor: t.colors.surface,
                color: t.colors.ink,
                padding: t.spacing.md,
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: 14,
                textAlignVertical: 'top',
              }}
            />

            <View style={{ gap: t.spacing.sm, marginTop: t.spacing.lg }}>
              <Button
                title={busy ? 'Working…' : primaryLabel}
                onPress={primaryAction}
                disabled={busy || hasErrors}
              />
              <Button
                title="Save draft"
                variant="secondary"
                onPress={() => run(async () => draft.saveDraft(), 'Draft saved.')}
                disabled={busy}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Screen>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const t = useTheme()
  return (
    <View style={{ marginBottom: t.spacing.md }}>
      <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.colors.sec, marginBottom: t.spacing.sm }}>
        {label}
      </Text>
      {children}
      {error ? <Text style={{ fontSize: 12.5, color: t.colors.danger, marginTop: 4 }}>{error}</Text> : null}
    </View>
  )
}

function PlainInput(props: React.ComponentProps<typeof TextInput>) {
  const t = useTheme()
  return (
    <TextInput
      placeholderTextColor={t.colors.muted}
      {...props}
      style={{
        height: 48,
        borderWidth: 1,
        borderColor: t.colors.border,
        borderRadius: t.radii.md,
        backgroundColor: t.colors.surface,
        color: t.colors.ink,
        paddingHorizontal: t.spacing.md,
        fontSize: t.typography.body.fontSize,
      }}
    />
  )
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[]
  selected: string
  onSelect: (v: string) => void
}) {
  const t = useTheme()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {options.map((opt) => {
          const on = opt === selected
          return (
            <Pressable
              key={opt}
              onPress={() => onSelect(opt)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: t.radii.pill,
                backgroundColor: on ? t.colors.accent : t.colors.surfaceAlt,
                borderWidth: 1,
                borderColor: on ? t.colors.accent : t.colors.border,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.colors.onAccent : t.colors.ink }}>
                {opt}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

function BarButton({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: t.radii.sm,
        backgroundColor: accent ? t.colors.accentSoft : t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: accent ? t.colors.textAccent : t.colors.ink }}>
        {label}
      </Text>
    </Pressable>
  )
}
