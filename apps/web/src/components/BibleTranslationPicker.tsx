import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { BibleTranslationGroup } from '../utils/bible/translationMenu'
import { translationOptionLabel } from '../utils/bible/translationMenu'
import './BibleTranslationPicker.css'

type BibleTranslationPickerProps = {
  id?: string
  value: string
  groups: BibleTranslationGroup[]
  onChange: (nextId: string) => void
  ariaLabel?: string
  labelPrefix?: string
  fullWidth?: boolean
}

type FlatTranslation = {
  id: string
  label: string
  displayLabel: string
  languageCode: string
}

export default function BibleTranslationPicker({
  id,
  value,
  groups,
  onChange,
  ariaLabel = 'Choose Bible translation',
  labelPrefix = '',
  fullWidth = false,
}: BibleTranslationPickerProps){
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const items = useMemo<FlatTranslation[]>(() => (
    (groups || []).flatMap((group) => (
      (group.translations || []).map((translation) => ({
        id: translation.id,
        label: translation.label || translation.id.toUpperCase(),
        displayLabel: translationOptionLabel(translation),
        languageCode: group.languageCode,
      }))
    ))
  ), [groups])

  const active = items.find((item) => item.id === value) || items[0] || null
  const compactLabel = labelPrefix
    ? `${labelPrefix}: ${active?.label || ''}`.trim()
    : String(active?.label || '').trim()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent | TouchEvent){
      const target = event.target as Node | null
      if (!target) return
      if (!rootRef.current?.contains(target)) setOpen(false)
    }
    function onEscape(event: KeyboardEvent){
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`gc-translation-picker ${fullWidth ? 'is-full' : ''}`.trim()}
    >
      <button
        id={id}
        type="button"
        className="gc-translation-picker__button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((prev) => !prev)}
      >
        {compactLabel}
      </button>

      {open ? (
        <div className="gc-translation-picker__menu" role="listbox" aria-label={ariaLabel}>
          {groups.map((group) => (
            <div key={group.languageCode} className="gc-translation-picker__group">
              <div className="gc-translation-picker__group-label" role="presentation">
                {group.languageLabel}
              </div>
              {group.translations.map((translation) => {
                const selected = translation.id === active?.id
                return (
                  <button
                    key={translation.id}
                    type="button"
                    role="option"
                    aria-selected={selected ? 'true' : 'false'}
                    className={`gc-translation-picker__option ${selected ? 'is-selected' : ''}`.trim()}
                    onClick={() => {
                      onChange(translation.id)
                      setOpen(false)
                    }}
                  >
                    {translationOptionLabel(translation)}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
