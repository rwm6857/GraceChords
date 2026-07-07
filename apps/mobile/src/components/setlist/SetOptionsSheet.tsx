import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FormSheetShell from '../FormSheetShell'
import ActionSheetRow from './ActionSheetRow'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'

// The setlist ••• sheet: Rename set / Saved sets… / New set / Delete set.
// Presented via the native formSheet route (src/lib/formSheetHost.ts).
// "Saved sets…" navigates back to the Setlists tab (the saved-sets list
// screen) rather than opening a nested sheet.
type SetOptionsProps = {
  visible: boolean
  onClose: () => void
  onRename: () => void
  onSavedSets: () => void
  onNewSet: () => void
  onDeleteSet: () => void
}

export default function SetOptionsSheet(props: SetOptionsProps) {
  useFormSheet(props.visible, () => <SetOptionsContent {...props} />, props.onClose)
  return null
}

function SetOptionsContent({ onClose, onRename, onSavedSets, onNewSet, onDeleteSet }: SetOptionsProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <FormSheetShell title="Setlist" onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.sm }}>
        <ActionSheetRow icon="pencil" label="Rename set" onPress={run(onRename)} />
        <ActionSheetRow icon="list.bullet" label="Saved sets…" onPress={run(onSavedSets)} />
        <ActionSheetRow icon="plus" label="New set" onPress={run(onNewSet)} />
        <ActionSheetRow icon="trash" label="Delete set" destructive onPress={run(onDeleteSet)} />
      </View>
    </FormSheetShell>
  )
}
