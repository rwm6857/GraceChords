import React, { useEffect } from 'react'
import SpritePicker from '../ui/SpritePicker'
import { CloseIcon } from '../Icons'

// Choosing an icon saves straight away; the modal closes once onSelect resolves.
export default function IconPickerModal({ open, value, saving, onSelect, onClose }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  return (
    <div className="gc-modal-overlay" onClick={() => !saving && onClose()}>
      <div
        className="gc-modal gc-icon-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gc-icon-picker-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="gc-icon-picker-modal__header">
          <h2 id="gc-icon-picker-title">Choose your icon</h2>
          <button
            type="button"
            className="gc-btn gc-btn--ghost gc-btn--sm gc-icon-picker-modal__close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <fieldset className="gc-icon-picker-modal__grid" disabled={saving}>
          <SpritePicker value={value} onChange={onSelect} />
        </fieldset>
      </div>
    </div>
  )
}
