// Keyboard control for the workspace.
//
// The old page had no keyboard reorder path at all: move(uid, dir) existed but
// nothing rendered it, and the moveUp/moveDown strings were orphaned. Building
// a set at a desk should not require the mouse, so these bindings are the
// primary interaction and drag-and-drop is the alternative.
//
// Nothing fires while a text field, select or contenteditable has focus —
// typing a song name must never transpose a row.
import { useEffect } from 'react'

function isTyping(target) {
  if (!target) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable === true
  )
}

export function useSetlistKeymap({
  enabled = true,
  items,
  selectedKey,
  onSelect,
  onMoveBy,
  onRemove,
  onTranspose,
  onFocusSearch,
  onRename,
  onWorship,
  onShortcuts,
}) {
  useEffect(() => {
    if (!enabled) return undefined

    function onKeyDown(e) {
      if (isTyping(e.target)) return
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'Enter') {
          e.preventDefault()
          onWorship()
        }
        return
      }
      if (e.altKey && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

      if (e.key === '/') {
        e.preventDefault()
        onFocusSearch()
        return
      }
      if (e.key === 'F2') {
        e.preventDefault()
        onRename()
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        onShortcuts()
        return
      }
      if (!items.length) return

      const index = items.findIndex((i) => i.entryKey === selectedKey)

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (index < 0) return
        e.preventDefault()
        onMoveBy(selectedKey, e.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onSelect(items[index < 0 ? 0 : Math.min(index + 1, items.length - 1)].entryKey)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onSelect(items[index < 0 ? items.length - 1 : Math.max(index - 1, 0)].entryKey)
        return
      }
      if (index < 0) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onRemove(selectedKey)
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        onTranspose(selectedKey, 1)
        return
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        onTranspose(selectedKey, -1)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    enabled,
    items,
    selectedKey,
    onSelect,
    onMoveBy,
    onRemove,
    onTranspose,
    onFocusSearch,
    onRename,
    onWorship,
    onShortcuts,
  ])
}
