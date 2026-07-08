import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
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
  const { t: tx } = useTranslation('setlist')
  const insets = useSafeAreaInsets()

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <FormSheetShell title={tx('options.title')} onAction={onClose}>
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.sm }}>
        <ActionSheetRow icon="pencil" label={tx('options.renameSet')} onPress={run(onRename)} />
        <ActionSheetRow icon="list.bullet" label={tx('options.savedSets')} onPress={run(onSavedSets)} />
        <ActionSheetRow icon="plus" label={tx('options.newSet')} onPress={run(onNewSet)} />
        <ActionSheetRow icon="trash" label={tx('options.deleteSet')} destructive onPress={run(onDeleteSet)} />
      </View>
    </FormSheetShell>
  )
}
