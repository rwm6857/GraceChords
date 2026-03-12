import React, { useEffect, useCallback, useState } from 'react'
import { getDiatonicChords } from '../../utils/chordpro/diatonicChords'

const VARIANTS = ['7', 'maj7', 'sus2', 'sus4']

export default function QuickChordsBar({ currentKey, onInsert }) {
  const [showVariants, setShowVariants] = useState(false)
  const chords = getDiatonicChords(currentKey)

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

  if (!currentKey) {
    return (
      <div className="gc-quick-chords">
        <p className="gc-quick-chords__empty">Set a key to enable quick chords</p>
      </div>
    )
  }

  if (!chords) {
    return (
      <div className="gc-quick-chords">
        <p className="gc-quick-chords__empty">Unknown key: {currentKey}</p>
      </div>
    )
  }

  return (
    <div className="gc-quick-chords">
      {/* Primary row */}
      <div className="gc-quick-chords__row">
        <span className="gc-quick-chords__label">Chords</span>
        {chords.map((c, i) => (
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
        <button
          className="gc-quick-chords__toggle"
          onClick={() => setShowVariants(v => !v)}
          type="button"
        >
          {showVariants ? 'Hide variants' : 'Show variants'}
        </button>
      </div>

      {/* Collapsible variant row */}
      {showVariants && (
        <div className="gc-quick-chords__row">
          <span className="gc-quick-chords__label">Variants</span>
          {chords.map(c =>
            VARIANTS.map(v => (
              <button
                key={`${c.symbol}${v}`}
                className="gc-quick-chords__btn gc-quick-chords__btn--variant"
                onClick={() => handleInsert(`${c.symbol}${v}`)}
                type="button"
              >
                {c.display}{v}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
