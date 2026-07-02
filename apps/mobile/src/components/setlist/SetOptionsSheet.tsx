import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet from '../BottomSheet'
import ActionSheetRow from './ActionSheetRow'
import { useTheme } from '../../theme/ThemeProvider'

// The setlist ••• sheet: Rename set / Saved sets… / New set / Delete set.
// "Saved sets…" navigates back to the Setlists tab (the saved-sets list
// screen) rather than opening a nested sheet.
export default function SetOptionsSheet({
  visible,
  onClose,
  onRename,
  onSavedSets,
  onNewSet,
  onDeleteSet,
}: {
  visible: boolean
  onClose: () => void
  onRename: () => void
  onSavedSets: () => void
  onNewSet: () => void
  onDeleteSet: () => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Setlist" closeAccessibilityLabel="Close setlist options">
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.sm }}>
        <ActionSheetRow icon="pencil" label="Rename set" onPress={run(onRename)} />
        <ActionSheetRow icon="list.bullet" label="Saved sets…" onPress={run(onSavedSets)} />
        <ActionSheetRow icon="plus" label="New set" onPress={run(onNewSet)} />
        <ActionSheetRow icon="trash" label="Delete set" destructive onPress={run(onDeleteSet)} />
      </View>
    </BottomSheet>
  )
}
