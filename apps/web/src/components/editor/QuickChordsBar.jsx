import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { getDiatonicChords } from '../../utils/chordpro/diatonicChords'

const VARIANTS = ['7', 'maj7', 'sus2', 'sus4']
// Angles (deg, 0 = right, clockwise) at which variants are placed around chord center.
// Order matches VARIANTS: top, right, bottom, left.
const VARIANT_ANGLES = [-90, 0, 90, 180]
const HOLD_MS = 250
const RADIAL_RADIUS = 56
const DEAD_ZONE = 18

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

export default function QuickChordsBar({ currentKey, onInsert }) {
  const chords = useMemo(() => getDiatonicChords(currentKey), [currentKey])

  const [popup, setPopup] = useState(null) // { chord, center: {x,y}, hoveredIndex }

  const popupRef = useRef(null)
  popupRef.current = popup

  const holdTimerRef = useRef(null)
  const holdActiveRef = useRef(false)
  const pointerIdRef = useRef(null)

  const handleInsert = useCallback((symbol) => {
    if (onInsert) onInsert(`[${symbol}]`)
  }, [onInsert])

  // Ctrl+1..7 keyboard shortcut for base diatonic chords; Esc closes radial popup.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && popupRef.current) {
        setPopup(null)
        holdActiveRef.current = false
        clearTimeout(holdTimerRef.current)
        return
      }
      if (!chords) return
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

  const computeHoveredIndex = useCallback((clientX, clientY) => {
    const cur = popupRef.current
    if (!cur) return -1
    const dx = clientX - cur.center.x
    const dy = clientY - cur.center.y
    if (Math.hypot(dx, dy) < DEAD_ZONE) return -1
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    let best = 0
    let bestDiff = Infinity
    VARIANT_ANGLES.forEach((va, i) => {
      const d = angleDiff(angle, va)
      if (d < bestDiff) { bestDiff = d; best = i }
    })
    return best
  }, [])

  // Window-level listeners while popup is open so release/move outside the
  // origin button still register and the menu stays correctly anchored.
  useEffect(() => {
    if (!popup) return

    const onMove = (e) => {
      if (!holdActiveRef.current) return
      const cur = popupRef.current
      if (!cur) return
      const idx = computeHoveredIndex(e.clientX, e.clientY)
      if (idx !== cur.hoveredIndex) {
        setPopup({ ...cur, hoveredIndex: idx })
      }
    }

    const onUp = (e) => {
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return
      const cur = popupRef.current
      if (cur && holdActiveRef.current) {
        const idx = computeHoveredIndex(e.clientX, e.clientY)
        if (idx >= 0) {
          handleInsert(`${cur.chord.symbol}${VARIANTS[idx]}`)
        }
      }
      holdActiveRef.current = false
      pointerIdRef.current = null
      setPopup(null)
    }

    const onCancel = () => {
      clearTimeout(holdTimerRef.current)
      holdActiveRef.current = false
      pointerIdRef.current = null
      setPopup(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [popup, handleInsert, computeHoveredIndex])

  const onPointerDown = useCallback((e, chord) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
    pointerIdRef.current = e.pointerId
    holdActiveRef.current = false
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      holdActiveRef.current = true
      setPopup({ chord, center, hoveredIndex: -1 })
    }, HOLD_MS)
  }, [])

  // Short tap/click — only fires if hold timer didn't activate.
  const onPointerUpOnButton = useCallback((e, chord) => {
    clearTimeout(holdTimerRef.current)
    if (holdActiveRef.current) {
      // Window-level pointerup will handle insertion.
      return
    }
    pointerIdRef.current = null
    handleInsert(chord.symbol)
  }, [handleInsert])

  const onPointerLeaveButton = useCallback(() => {
    // If hold hasn't activated yet and pointer leaves before HOLD_MS, cancel
    // the pending hold so a drag-off doesn't accidentally open the popup
    // far from the cursor.
    if (!holdActiveRef.current) {
      clearTimeout(holdTimerRef.current)
    }
  }, [])

  return (
    <div className="gc-quick-chords">
      <div className="gc-quick-chords__row">
        <span className="gc-quick-chords__label">Chords</span>
        {!currentKey && (
          <span className="gc-quick-chords__empty">Set a key to enable quick chords</span>
        )}
        {chords && chords.map((c, i) => (
          <button
            key={c.symbol}
            className="gc-quick-chords__btn"
            onPointerDown={(e) => onPointerDown(e, c)}
            onPointerUp={(e) => onPointerUpOnButton(e, c)}
            onPointerLeave={onPointerLeaveButton}
            onContextMenu={(e) => e.preventDefault()}
            title={`${c.degree} – Ctrl+${i + 1} (hold for variants)`}
            type="button"
          >
            {c.display}
            <span className="gc-quick-chords__degree">{c.degree}</span>
          </button>
        ))}
      </div>

      {popup && <RadialVariantPopup popup={popup} />}
    </div>
  )
}

function RadialVariantPopup({ popup }) {
  const { chord, center, hoveredIndex } = popup
  return (
    <div className="gc-quick-chords__radial" aria-hidden="true">
      <div
        className="gc-quick-chords__radial-center"
        style={{ left: center.x, top: center.y }}
      >
        {chord.display}
      </div>
      {VARIANTS.map((v, i) => {
        const angle = (VARIANT_ANGLES[i] * Math.PI) / 180
        const x = center.x + Math.cos(angle) * RADIAL_RADIUS
        const y = center.y + Math.sin(angle) * RADIAL_RADIUS
        const active = i === hoveredIndex
        return (
          <div
            key={v}
            className={`gc-quick-chords__radial-item${active ? ' gc-quick-chords__radial-item--active' : ''}`}
            style={{ left: x, top: y }}
          >
            {chord.display}{v}
          </div>
        )
      })}
    </div>
  )
}
