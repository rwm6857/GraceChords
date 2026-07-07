import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { insertAtCursor as coreInsert, wrapSection as coreWrap } from '@gracechords/core'
import QuickChordsBar from './QuickChordsBar'
import QuickSectionsBar from './QuickSectionsBar'

const ChordProEditor = forwardRef(function ChordProEditor(
  { value, onChange, currentKey, readOnly = false, onGuideOpen },
  ref
) {
  const textareaRef = useRef(null)

  useImperativeHandle(ref, () => ({
    getTextareaRef: () => textareaRef.current,
    insertAtCursor,
    wrapSelection,
  }))

  // String math lives in @gracechords/core (shared with mobile); this keeps only
  // the DOM glue — read the live selection, apply, then restore the caret.
  const insertAtCursor = useCallback((text) => {
    const el = textareaRef.current
    if (!el) return
    const sel = { start: el.selectionStart, end: el.selectionEnd }
    const next = coreInsert(value, sel, text)
    onChange(next.value)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(next.selection.start, next.selection.end)
    })
  }, [value, onChange])

  const wrapSelection = useCallback(({ directive, label }) => {
    const el = textareaRef.current
    if (!el) return
    const sel = { start: el.selectionStart, end: el.selectionEnd }
    const next = coreWrap(value, sel, { directive, label })
    onChange(next.value)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(next.selection.start, next.selection.end)
    })
  }, [value, onChange])

  return (
    <div className="gc-chordpro-editor">
      <QuickChordsBar
        currentKey={currentKey}
        onInsert={insertAtCursor}
      />
      <div className="gc-chordpro-editor__toolbar">
        <QuickSectionsBar onWrap={wrapSelection} />
        {onGuideOpen && (
          <button
            type="button"
            className="gc-chordpro-editor__guide-btn"
            onClick={onGuideOpen}
            title="ChordPro syntax guide"
            aria-label="Open ChordPro guide"
          >
            ?
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        className="gc-chordpro-textarea"
        value={value}
        onChange={e => !readOnly && onChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder="Enter ChordPro content here...

Example:
{start_of_verse: Verse 1}
[G]Amazing [D]grace how [Em]sweet the [C]sound
{end_of_verse}"
      />
    </div>
  )
})

export default ChordProEditor
