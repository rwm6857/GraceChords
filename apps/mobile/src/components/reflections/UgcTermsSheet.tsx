import { useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FormSheetShell from '../FormSheetShell'
import SymbolIcon from '../SymbolIcon'
import { useFormSheet } from '../../lib/formSheetHost'
import { useTheme } from '../../theme/ThemeProvider'
import { errMessage } from '../../lib/errors'
import { acceptUgcTerms } from '../../lib/ugc'
import { supabase } from '../../lib/supabase'
import {
  TERMS_URL,
  UGC_GATE_CONFIRM_PREFIX,
  UGC_GATE_ENFORCEMENT,
  UGC_GATE_INTRO,
  UGC_GATE_RULES,
  UGC_GATE_SUBHEAD,
} from '../../lib/ugcTerms'

// The Apple 1.2 UGC acceptance gate, shown before a user's FIRST public post.
// "Agree & Share" records acceptance (accept_ugc_terms RPC) and is itself the
// explicit public-post confirm, then calls onAgreed() to proceed with the post.
// The legal body copy is fixed English (ugcTerms.ts); only labels are i18n.
type UgcProps = {
  visible: boolean
  onClose: () => void
  /** Called after acceptance is recorded — proceed with the pending public post. */
  onAgreed: () => void
}

export default function UgcTermsSheet(props: UgcProps) {
  useFormSheet(props.visible, () => <UgcContent {...props} />, props.onClose)
  return null
}

function UgcContent({ onClose, onAgreed }: UgcProps) {
  const t = useTheme()
  const { t: tx } = useTranslation('reader')
  const [busy, setBusy] = useState(false)

  const agree = async () => {
    if (busy) return
    setBusy(true)
    try {
      await acceptUgcTerms(supabase)
      onAgreed()
    } catch (err: unknown) {
      setBusy(false)
      Alert.alert(tx('ugc.errorTitle'), errMessage(err))
    }
  }

  return (
    <FormSheetShell title={tx('ugc.title')} actionLabel={tx('ugc.cancel')} onAction={onClose}>
      <ScrollView
        style={{ maxHeight: 460 }}
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}
      >
        <Text style={{ fontSize: 15, lineHeight: 22, color: t.colors.sec }}>{UGC_GATE_INTRO}</Text>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.ink }}>{UGC_GATE_SUBHEAD}</Text>
        <View style={{ gap: 8 }}>
          {UGC_GATE_RULES.map((rule, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <SymbolIcon name="checkmark.circle.fill" size={16} color={t.colors.accent} />
              <Text style={{ flex: 1, fontSize: 14.5, lineHeight: 21, color: t.colors.ink }}>{rule}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.colors.muted }}>{UGC_GATE_ENFORCEMENT}</Text>
        <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.colors.muted }}>
          {UGC_GATE_CONFIRM_PREFIX}
          <Text
            style={{ color: t.colors.accent, fontWeight: '600' }}
            onPress={() => void Linking.openURL(TERMS_URL)}
          >
            {tx('ugc.termsLink')}
          </Text>
          .
        </Text>

        <Pressable
          onPress={agree}
          disabled={busy}
          accessibilityRole="button"
          style={{
            height: 50,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: t.spacing.sm,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color={t.colors.onAccent} />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.colors.onAccent }}>
              {tx('ugc.agree')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </FormSheetShell>
  )
}
