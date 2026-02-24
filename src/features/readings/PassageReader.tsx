import React, { useEffect, useMemo, useRef, useState, useCallback, useImperativeHandle } from 'react'
import type { Passage } from './types'
import { buildCopyText, sortedVerses, toggleSelection } from './selection'
import { fetchBibleChapter, type ChapterData } from '../../utils/bible/chapters'
import { isRtlBibleLanguage } from '../../utils/bible/direction'

type Props = {
  passage: Passage
  translationId: string
  translationLabel: string
  translationLanguage: string
  selection: Set<number>
  onSelectionChange: (next: Set<number>) => void
  onNavigate?: (direction: 'prev' | 'next') => void
}

export type PassageReaderHandle = {
  copy: () => void
}

const PassageReader = React.forwardRef<PassageReaderHandle, Props>(function PassageReader(
  { passage, translationId, translationLabel, translationLanguage, selection, onSelectionChange, onNavigate },
  ref
){
  const readerRef = useRef<HTMLDivElement | null>(null)
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const touchRef = useRef({ x: 0, y: 0, active: false })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setChapter(null)

    fetchBibleChapter({
      translationId,
      book: String(passage.bookNumber),
      chapter: passage.chapter,
      signal: controller.signal,
    })
      .then((json) => setChapter(json))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message || 'Failed to load passage')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [translationId, passage.bookNumber, passage.chapter])

  const versesInScope = useMemo(() => {
    if (!chapter) return []
    const entries = Object.entries(chapter.verses || {})
    const numbers = entries.map(([n]) => Number(n)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
    return numbers
      .filter((n) => isVerseInRange(n, passage))
      .map((n) => ({ num: n, text: chapter.verses[String(n)] }))
  }, [chapter, passage])

  const selectionArray = useMemo(() => sortedVerses(selection), [selection])
  const rtl = useMemo(() => isRtlBibleLanguage(translationLanguage), [translationLanguage])

  const handleCopy = useCallback(async () => {
    if (!chapter || !selectionArray.length) return
    const text = buildCopyText(passage, selectionArray, chapter.verses, translationLabel)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }, [chapter, selectionArray, passage, translationLabel])

  useImperativeHandle(ref, () => ({
    copy: () => { handleCopy() },
  }), [handleCopy])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>){
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')){
      if (selectionArray.length){
        e.preventDefault()
        handleCopy()
      }
    }
  }

  function handleVerseClick(num: number){
    const next = toggleSelection(selection, num)
    onSelectionChange(next)
    readerRef.current?.focus({ preventScroll: true } as any)
  }

  return (
    <div
      ref={readerRef}
      className={`gc-card readings-reader ${rtl ? 'is-rtl' : ''}`.trim()}
      dir={rtl ? 'rtl' : 'ltr'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return
        touchRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          active: true,
        }
      }}
      onTouchEnd={(e) => {
        if (!touchRef.current.active) return
        const touch = e.changedTouches[0]
        const dx = touch.clientX - touchRef.current.x
        const dy = touch.clientY - touchRef.current.y
        touchRef.current.active = false
        if (Math.abs(dx) < 50) return
        if (Math.abs(dx) < Math.abs(dy) * 1.2) return
        if (dx < 0) onNavigate?.('next')
        else onNavigate?.('prev')
      }}
    >
      {loading ? <p className="readings-status">Loading passage...</p> : null}
      {error ? <p className="readings-status readings-status--error">{error}</p> : null}

      {!loading && !error ? (
        <div className="readings-verses">
          {versesInScope.map(({ num, text }) => {
            const isSelected = selection.has(num)
            return (
              <div
                key={num}
                className={`readings-verse ${isSelected ? 'is-selected' : ''}`.trim()}
                onClick={() => handleVerseClick(num)}
              >
                {rtl ? (
                  <>
                    <span className="readings-verse__text">{text}</span>
                    <span className="readings-verse__num">{num}</span>
                  </>
                ) : (
                  <>
                    <span className="readings-verse__num">{num}</span>
                    <span className="readings-verse__text">{text}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
})

export default PassageReader

function isVerseInRange(verse: number, passage: Passage){
  if (!passage.range) return true
  if (verse < passage.range.start) return false
  if (passage.range.end == null) return true
  return verse <= passage.range.end
}
