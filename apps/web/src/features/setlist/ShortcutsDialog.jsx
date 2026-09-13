import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/layout-kit'

// Keys are literal and identical in every locale, so only the descriptions are
// translated.
const ROWS = [
  { keys: ['/'], key: 'shortcutSearch' },
  { keys: ['↑', '↓'], key: 'shortcutSelect' },
  { keys: ['Alt', '↑'], key: 'shortcutMove' },
  { keys: ['+', '−'], key: 'shortcutTranspose' },
  { keys: ['Delete'], key: 'shortcutRemove' },
  { keys: ['F2'], key: 'shortcutRename' },
  { keys: ['Ctrl', 'Enter'], key: 'shortcutWorship' },
  { keys: ['Esc'], key: 'shortcutEscape' },
]

export default function ShortcutsDialog({ open, onClose }) {
  const { t } = useTranslation('pages')
  if (!open) return null

  return (
    <div
      className="gc-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gc-shortcuts-title"
    >
      <div className="gc-modal gc-shortcuts-modal">
        <h2 id="gc-shortcuts-title">{t('setlist.shortcutsTitle')}</h2>
        <table className="gc-shortcuts-table">
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="gc-shortcut-keys">
                  {row.keys.map((k, i) => (
                    <React.Fragment key={k}>
                      {i > 0 ? <span className="gc-shortcut-plus">+</span> : null}
                      <kbd>{k}</kbd>
                    </React.Fragment>
                  ))}
                </td>
                <td>{t(`setlist.${row.key}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="gc-modal-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('setlist.close')}
          </Button>
        </div>
      </div>
    </div>
  )
}
