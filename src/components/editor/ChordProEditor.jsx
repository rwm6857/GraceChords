import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import QuickChordsBar from './QuickChordsBar'
import QuickSectionsBar from './QuickSectionsBar'

const ChordProEditor = forwardRef(function ChordProEditor(
  { value, onChange, currentKey, readOnly = false },
  ref
) {
  const textareaRef = useRef(null)

  useImperativeHandle(ref, () => ({
    getTextareaRef: () => textareaRef.current,
    insertAtCursor,
    wrapSelection,
  }))

  const insertAtCursor = useCallback((text) => {
    const el = textareaRef.current
    if (!el) return

    const start = el.selectionStart
    const end = el.selectionEnd
    const before = value.slice(0, start)
    const after = value.slice(end)
    const newValue = before + text + after

    onChange(newValue)

    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      const newPos = start + text.length
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(newPos, newPos)
    })
  }, [value, onChange])

  const wrapSelection = useCallback(({ directive, label }) => {
    const el = textareaRef.current
    if (!el) return

    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const before = value.slice(0, start)
    const after = value.slice(end)

    const startDir = `{start_of_${directive}: ${label}}`
    const endDir = `{end_of_${directive}}`

    let insertion
    let cursorOffset
    if (selected) {
      insertion = `${startDir}\n${selected}\n${endDir}\n`
      cursorOffset = start + insertion.length
    } else {
      insertion = `${startDir}\n\n${endDir}\n`
      // Place cursor between the directives
      cursorOffset = start + startDir.length + 1
    }

    const newValue = before + insertion + after
    onChange(newValue)

    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      if (!selected) {
        textareaRef.current.setSelectionRange(cursorOffset, cursorOffset)
      } else {
        textareaRef.current.setSelectionRange(start, start + insertion.length)
      }
    })
  }, [value, onChange])

  return (
    <div className="gc-chordpro-editor">
      <QuickChordsBar
        currentKey={currentKey}
        onInsert={insertAtCursor}
      />
      <QuickSectionsBar onWrap={wrapSelection} />
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
