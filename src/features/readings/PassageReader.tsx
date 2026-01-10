import React, { useEffect, useMemo, useRef, useState } from 'react'
import IconButton from '../../components/ui/layout-kit/IconButton'
import { CopyIcon } from '../../components/Icons'
import type { Passage } from './types'
import { buildCopyText, sortedVerses, toggleSelection } from './selection'

type ChapterData = {
  book: string
  chapter: number
  verses: Record<string, string>
}

type Props = {
  passage: Passage
  selection: Set<number>
  onSelectionChange: (next: Set<number>) => void
}

export default function PassageReader({ passage, selection, onSelectionChange }: Props){
  const readerRef = useRef<HTMLDivElement | null>(null)
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  useEffect(() => {
    const url = `/esv/${encodeURIComponent(passage.book)}/${passage.chapter}.json`
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setChapter(null)

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load passage (${res.status})`)
        return res.json()
      })
      .then((json) => setChapter(json))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message || 'Failed to load passage')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [passage.book, passage.chapter])

  useEffect(() => {
    // keep the container focusable for copy shortcut
    readerRef.current?.focus({ preventScroll: true } as any)
  }, [passage.book, passage.chapter])

  const versesInScope = useMemo(() => {
    if (!chapter) return []
    const entries = Object.entries(chapter.verses || {})
    const numbers = entries.map(([n]) => Number(n)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
    return numbers
      .filter((n) => isVerseInRange(n, passage))
      .map((n) => ({ num: n, text: chapter.verses[String(n)] }))
  }, [chapter, passage])

  const selectionArray = useMemo(() => sortedVerses(selection), [selection])

  useEffect(() => {
    setCopyStatus(null)
  }, [passage.book, passage.chapter, selectionArray.length])

  async function handleCopy(){
    if (!chapter || !selectionArray.length) return
    const text = buildCopyText(passage, selectionArray, chapter.verses)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('Copied to clipboard')
    } catch (err: any) {
      setCopyStatus(err?.message || 'Copy failed')
    }
  }

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
    // keep focus for keyboard copy
    readerRef.current?.focus()
  }

  return (
    <div
      ref={readerRef}
      className="gc-card readings-reader"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={(e) => { if (e.currentTarget === e.target) readerRef.current?.focus() }}
    >
      <header className="readings-reader__header">
        <div className="readings-reader__heading">
          <div className="readings-reader__book">{passage.book} {passage.chapter}</div>
          {passage.range ? <div className="readings-reader__range">{rangeLabel(passage.range)}</div> : null}
        </div>
        {selectionArray.length ? (
          <IconButton
            variant="ghost"
            label="Copy selected verses"
            onClick={handleCopy}
            className="readings-copy"
          >
            <CopyIcon />
          </IconButton>
        ) : null}
      </header>

      {loading ? <p className="readings-status">Loading passage...</p> : null}
      {error ? <p className="readings-status readings-status--error">{error}</p> : null}

      {!loading && !error ? (
        <div className="readings-verses">
          {versesInScope.map(({ num, text }) => {
            const isSelected = selection.has(num)
            return (
              <div
                key={num}
                role="button"
                tabIndex={0}
                className={`readings-verse ${isSelected ? 'is-selected' : ''}`.trim()}
                onClick={() => handleVerseClick(num)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' '){
                    e.preventDefault()
                    handleVerseClick(num)
                  }
                }}
              >
                <span className="readings-verse__num">{num}</span>
                <span className="readings-verse__text">{text}</span>
              </div>
            )
          })}
        </div>
      ) : null}
      {copyStatus ? <div className="readings-status readings-status--muted">{copyStatus}</div> : null}
    </div>
  )
}

function isVerseInRange(verse: number, passage: Passage){
  if (!passage.range) return true
  if (verse < passage.range.start) return false
  if (passage.range.end == null) return true
  return verse <= passage.range.end
}

function rangeLabel(range: { start: number, end: number | null }){
  if (range.end === null) return `Verses ${range.start}-end`
  if (range.start === range.end) return `Verse ${range.start}`
  return `Verses ${range.start}-${range.end}`
}
