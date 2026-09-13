import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { summarizeSet, formatSetSummary, timeAgo } from '@gracechords/core'
import { PencilIcon } from '../../components/Icons'
import { effectiveEntryKey } from '../../utils/setlists/entries'

// Click-to-edit title, the set's summary line, and the save state. There is no
// Save button anywhere in the workspace, so this line is the only signal that
// an edit reached the server — it has to be honest and always visible.
export default function SetHeader({
  name,
  items,
  updatedAt,
  saving,
  saveFailed,
  persisted,
  onRename,
  renameSignal,
}) {
  const { t } = useTranslation(['pages', 'common'])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef(null)

  // The `F2` shortcut and the ⋯ menu both open the editor from outside.
  useEffect(() => {
    if (renameSignal > 0) setEditing(true)
  }, [renameSignal])

  useEffect(() => {
    if (editing) {
      setDraft(name)
      // Focus after the input has mounted.
      const id = requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
      return () => cancelAnimationFrame(id)
    }
    return undefined
  }, [editing, name])

  function commit() {
    if (!editing) return
    setEditing(false)
    const next = draft.trim()
    // An empty name reverts rather than saving a blank set.
    if (next && next !== name) onRename(next)
  }

  const summary = summarizeSet(
    items.map((i) => ({ toKey: effectiveEntryKey(i), tempo: i.song?.tempo ?? null })),
    undefined
  )
  const edited = timeAgo(updatedAt, (k, o) => t(`common:${k}`, o))

  let state = null
  if (saveFailed) {
    state = <span className="gc-set-save is-failed">{t('setlist.saveFailed')}</span>
  } else if (saving) {
    state = <span className="gc-set-save is-saving">{t('setlist.saving')}</span>
  } else if (!persisted) {
    state = <span className="gc-set-save is-local">{t('setlist.savedOnDevice')}</span>
  } else if (edited) {
    state = <span className="gc-set-save is-saved">{t('setlist.editedAgo', { ago: edited })}</span>
  } else {
    state = <span className="gc-set-save is-saved">{t('setlist.saved')}</span>
  }

  return (
    <div className="gc-set-header">
      {/* The set's name is this page's heading — there is no separate page title
          bar, which is part of how the workspace gets its vertical space back. */}
      {editing ? (
        <input
          ref={inputRef}
          id="gc-set-name"
          className="gc-set-title-input"
          value={draft}
          aria-label={t('setlist.fieldName')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
            }
          }}
        />
      ) : (
        <h1 className="gc-set-heading">
          <button type="button" className="gc-set-title" onClick={() => setEditing(true)}>
            <span>{name || t('setlist.untitledSet')}</span>
            <PencilIcon />
          </button>
        </h1>
      )}
      <div className="gc-set-meta">
        <span>{formatSetSummary(summary)}</span>
        <span aria-hidden="true" className="gc-set-meta-dot">·</span>
        {state}
      </div>
    </div>
  )
}
