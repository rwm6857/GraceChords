import { useMemo, useState } from 'react'
import { Alert, FlatList, Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ListRow from '../ListRow'
import SymbolIcon from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { errMessage } from '../../lib/errors'
import type { SetlistRow } from '../../lib/useSetlists'

// Shown when the user hits their per-role personal setlist cap. Lists every
// saved set oldest-first with a multi-select checkmark; deleting the selection
// frees room so the caller's blocked "New set" can be retried. Mirrors the
// web builder's limit-reached prune modal (apps/web/src/pages/SetlistPage.jsx).
export default function PruneSetlistsModal({
  visible,
  onClose,
  setlists,
  limit,
  onConfirmDelete,
}: {
  visible: boolean
  onClose: () => void
  setlists: SetlistRow[]
  limit: number
  onConfirmDelete: (ids: string[]) => Promise<void>
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // Oldest first so the user prunes stale sets before recent ones.
  const ordered = useMemo(
    () =>
      setlists
        .slice()
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()),
    [setlists],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function close() {
    setSelected(new Set())
    onClose()
  }

  async function confirm() {
    if (selected.size === 0 || busy) return
    setBusy(true)
    try {
      await onConfirmDelete(Array.from(selected))
      setSelected(new Set())
      onClose()
    } catch (err: unknown) {
      Alert.alert('Could not delete setlists', errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function subtitle(item: SetlistRow) {
    const created = item.created_at
      ? (() => {
          try {
            return new Date(item.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          } catch {
            return ''
          }
        })()
      : ''
    const n = item.songCount
    return [created, `${n} ${n === 1 ? 'song' : 'songs'}`].filter(Boolean).join(' · ')
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
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
            Setlist limit reached
          </Text>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} disabled={busy}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.textAccent, opacity: busy ? 0.5 : 1 }}>
              Cancel
            </Text>
          </Pressable>
        </View>

        <Text
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.sm,
            fontSize: t.typography.body.fontSize,
            color: t.colors.muted,
          }}
        >
          {`You've saved ${setlists.length} of your ${limit} setlists. Select some to delete (oldest first), then try again.`}
        </Text>

        <FlatList
          data={ordered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const checked = selected.has(item.id)
            return (
              <ListRow
                title={item.name}
                subtitle={subtitle(item)}
                accessibilityLabel={checked ? `Deselect ${item.name}` : `Select ${item.name} to delete`}
                onPress={() => toggle(item.id)}
                trailing={
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: t.radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: checked ? t.colors.danger : 'transparent',
                      borderWidth: checked ? 0 : 1.5,
                      borderColor: t.colors.border,
                    }}
                  >
                    {checked ? (
                      <SymbolIcon name="checkmark" size={14} weight="semibold" color={t.colors.onDanger} />
                    ) : null}
                  </View>
                }
              />
            )
          }}
          contentContainerStyle={{ paddingBottom: t.spacing.lg, flexGrow: 1 }}
        />

        {/* Footer: delete CTA */}
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.sm,
            paddingBottom: Math.max(insets.bottom, t.spacing.sm),
            borderTopWidth: 0.5,
            borderTopColor: t.colors.border,
          }}
        >
          <Pressable
            onPress={confirm}
            disabled={selected.size === 0 || busy}
            accessibilityRole="button"
            accessibilityLabel="Delete selected setlists"
            style={({ pressed }) => ({
              height: 48,
              borderRadius: t.radii.md,
              backgroundColor: t.colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: selected.size === 0 || busy ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: t.colors.onDanger, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 }}>
              {selected.size > 0 ? `Delete ${selected.size}` : 'Delete selected'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
