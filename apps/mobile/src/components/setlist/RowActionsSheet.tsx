import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from '../BottomSheet'
import ActionSheetRow from './ActionSheetRow'
import { useTheme } from '../../theme/ThemeProvider'

// Per-song ••• sheet: Change key / Duplicate / Remove from set.
export default function RowActionsSheet({
  visible,
  onClose,
  onDismissed,
  songTitle,
  onChangeKey,
  onDuplicate,
  onRemove,
}: {
  visible: boolean
  onClose: () => void
  /** Fires once fully dismissed — safe to present a follow-up sheet. */
  onDismissed?: () => void
  songTitle: string
  onChangeKey: () => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      title={songTitle}
      closeAccessibilityLabel="Close song options"
    >
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.sm }}>
        <ActionSheetRow icon="music.note" label="Change key" onPress={run(onChangeKey)} />
        <ActionSheetRow icon="plus.square.on.square" label="Duplicate" onPress={run(onDuplicate)} />
        <ActionSheetRow icon="trash" label="Remove from set" destructive onPress={run(onRemove)} />
      </View>
    </BottomSheet>
  )
}
