import React, { useEffect, useCallback, useMemo, useState } from 'react'
import { getDiatonicChords } from '../../utils/chordpro/diatonicChords'

const VARIANTS = ['7', 'maj7', 'sus2', 'sus4']

export default function QuickChordsBar({ currentKey, onInsert }) {
  const [showVariants, setShowVariants] = useState(false)
  // Memoize so chords only recomputes when currentKey actually changes,
  // not on every parent re-render. Prevents keydown listener from being
  // re-registered on every keystroke.
  const chords = useMemo(() => getDiatonicChords(currentKey), [currentKey])

  const handleInsert = useCallback((chord) => {
    if (onInsert) onInsert(`[${chord}]`)
  }, [onInsert])

  // Ctrl+1 through Ctrl+7 for scale degrees I–VII
  useEffect(() => {
    if (!chords) return

    function handleKeyDown(e) {
      if (!e.ctrlKey && !e.metaKey) return
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 7) {
        e.preventDefault()
        handleInsert(chords[num - 1].symbol)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [chords, handleInsert])

  return (
    <div className="gc-quick-chords">
      {/* Primary row — always visible */}
      <div className="gc-quick-chords__row">
        <span className="gc-quick-chords__label">Chords</span>
        {!currentKey && (
          <span className="gc-quick-chords__empty">Set a key to enable quick chords</span>
        )}
        {chords && chords.map((c, i) => (
          <button
            key={c.symbol}
            className="gc-quick-chords__btn"
            onClick={() => handleInsert(c.symbol)}
            title={`${c.degree} – Ctrl+${i + 1}`}
            type="button"
          >
            {c.display}
            <span className="gc-quick-chords__degree">{c.degree}</span>
          </button>
        ))}
        {chords && (
          <button
            className="gc-quick-chords__toggle"
            onClick={() => setShowVariants(v => !v)}
            type="button"
            aria-pressed={showVariants}
          >
            {showVariants ? 'Hide variants' : 'Show variants'}
          </button>
        )}
      </div>

      {/* Variants row — always rendered; toggled via CSS visibility only to avoid layout shift */}
      <div
        className="gc-quick-chords__variants-wrap"
        aria-hidden={!showVariants}
      >
        <div className={`gc-quick-chords__variants${showVariants ? ' gc-quick-chords__variants--visible' : ''}`}>
          <span className="gc-quick-chords__label">Variants</span>
          {chords && chords.map(c =>
            VARIANTS.map(v => (
              <button
                key={`${c.symbol}${v}`}
                className="gc-quick-chords__btn gc-quick-chords__btn--variant"
                onClick={() => handleInsert(`${c.symbol}${v}`)}
                type="button"
                tabIndex={showVariants ? 0 : -1}
              >
                {c.display}{v}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
