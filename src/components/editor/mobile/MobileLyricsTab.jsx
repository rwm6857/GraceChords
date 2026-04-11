import React, { useCallback, useEffect, useRef, useState } from 'react'
import KeyboardAccessoryBar from './KeyboardAccessoryBar'
import ChordProGuideDrawer from '../ChordProGuideDrawer'

export default function MobileLyricsTab({ values, onChange, onPreviewToggle }) {
  const textareaRef = useRef(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  // Track keyboard height via visualViewport API
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function handle() {
      const kh = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0))
      setKeyboardHeight(kh)
    }

    vv.addEventListener('resize', handle)
    vv.addEventListener('scroll', handle)
    return () => {
      vv.removeEventListener('resize', handle)
      vv.removeEventListener('scroll', handle)
    }
  }, [])

  const insertAtCursor = useCallback((text) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const content = values.chordpro_content || ''
    const next = content.slice(0, start) + text + content.slice(end)
    onChange({ ...values, chordpro_content: next })
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      const pos = start + text.length
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pos, pos)
    })
  }, [values, onChange])

  const wrapSelection = useCallback(({ directive, label }) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const content = values.chordpro_content || ''
    const selected = content.slice(start, end)
    const before = content.slice(0, start)
    const after = content.slice(end)
    const startDir = `{start_of_${directive}: ${label}}`
    const endDir = `{end_of_${directive}}`
    const insertion = selected
      ? `${startDir}\n${selected}\n${endDir}\n`
      : `${startDir}\n\n${endDir}\n`
    onChange({ ...values, chordpro_content: before + insertion + after })
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
    })
  }, [values, onChange])

  return (
    <div className={`gc-me-lyrics-tab${isFocused ? ' is-focused' : ''}`}>
      <div className="gc-me-lyrics-tab__actions">
        <button
          type="button"
          className="gc-btn gc-btn--secondary gc-btn--sm"
          onClick={onPreviewToggle}
        >
          Preview
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="gc-me-textarea"
        value={values.chordpro_content || ''}
        onChange={e => onChange({ ...values, chordpro_content: e.target.value })}
        onFocus={() => setIsFocused(true)}
        onBlur={() => { setIsFocused(false); setKeyboardHeight(0) }}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder={`Enter ChordPro content here…\n\nExample:\n{start_of_verse: Verse 1}\n[G]Amazing [D]grace how [Em]sweet the [C]sound\n{end_of_verse}`}
      />

      {isFocused && (
        <KeyboardAccessoryBar
          currentKey={values.default_key}
          onInsert={insertAtCursor}
          onWrap={wrapSelection}
          onGuideOpen={() => setShowGuide(true)}
          keyboardHeight={keyboardHeight}
        />
      )}

      <ChordProGuideDrawer open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  )
}
