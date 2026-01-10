import React, { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../../components/ui/layout-kit/PageHeader'
import IconButton from '../../components/ui/layout-kit/IconButton'
import PassageReader, { type PassageReaderHandle } from './PassageReader'
import { expandReadings } from './expandReadings'
import { addDays, getPlanForDate } from './useMcheyne'
import { formatPassageLabel } from './selection'
import type { Passage } from './types'
import './readings.css'
import { CopyIcon, ArrowLeft, ArrowRight } from '../../components/Icons'

export default function ReadingsPage(){
  const [date, setDate] = useState(() => new Date())
  const [passageIndex, setPassageIndex] = useState(0)
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const readerRef = useRef<PassageReaderHandle | null>(null)
  const readerTopRef = useRef<HTMLDivElement | null>(null)

  const planForDate = useMemo(() => getPlanForDate(date), [date])
  const passages = useMemo(() => expandReadings(planForDate.readings), [planForDate.readings])
  const currentPassage: Passage | null = passages[passageIndex] || null

  useEffect(() => {
    setPassageIndex(0)
    setSelection(new Set())
  }, [planForDate.mmdd])

  useEffect(() => {
    setSelection(new Set())
  }, [passageIndex])

  useEffect(() => {
    if (!readerTopRef.current) return
    readerTopRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [passageIndex, planForDate.mmdd])

  function updateDate(next: Date){
    setDate(next)
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>){
    const val = e.target.value
    if (!val) return
    const [year, month, day] = val.split('-').map((n) => parseInt(n, 10))
    if (!year || !month || !day) return
    updateDate(new Date(year, month - 1, day))
  }

  function goToRelativeDay(delta: number){
    updateDate(addDays(date, delta))
  }

  function goToPassage(delta: number){
    if (!passages.length) return
    setPassageIndex((idx) => {
      const next = (idx + delta + passages.length) % passages.length
      return next
    })
  }

  const inputDate = formatInputDate(date)
  return (
    <div className="container readings-page">
      <PageHeader
        title="Daily Bible Reading"
        subtitle="Reading the Bible following Robert Murray M'Cheyne's plan will take you through the entire Bible in a year, including the New Testament & Psalms twice. Read, meditate, and pray over the word in your church and family worship."
      />

      <section className="readings-dateblock">
        <div className="readings-date">
          <IconButton label="Previous day" className="readings-datebtn" onClick={() => goToRelativeDay(-1)}>
            <ArrowLeft />
          </IconButton>
          <label className="readings-date__picker">
            <span className="sr-only">Select date</span>
            <input type="date" value={inputDate} onChange={handleDateChange} aria-label="Pick date" />
          </label>
          <IconButton label="Next day" className="readings-datebtn" onClick={() => goToRelativeDay(1)}>
            <ArrowRight />
          </IconButton>
        </div>
        <div className="readings-chips">
          <ul className="readings-list" aria-label="Passages">
            {passages.map((passage, idx) => {
              const isActive = idx === passageIndex
              return (
                <li key={`${passage.book}-${passage.chapter}-${idx}`}>
                  <button
                    type="button"
                    className={`readings-chip ${isActive ? 'is-active' : ''}`.trim()}
                    onClick={() => setPassageIndex(idx)}
                    aria-current={isActive ? 'true' : 'false'}
                  >
                    {formatPassageLabel(passage)}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {currentPassage ? (
        <>
          <div ref={readerTopRef} className="readings-reader-anchor" />
          <PassageReader
            ref={readerRef}
            passage={currentPassage}
            selection={selection}
            onSelectionChange={setSelection}
            onNavigate={(direction) => goToPassage(direction === 'next' ? 1 : -1)}
          />
        </>
      ) : (
        <div className="gc-card readings-status readings-status--error">No passages found for this day.</div>
      )}

      <button
        type="button"
        className={`readings-copy-fab ${selection.size ? 'is-visible' : ''}`.trim()}
        onClick={() => readerRef.current?.copy()}
        aria-label="Copy selected verses"
        aria-hidden={!selection.size}
        tabIndex={selection.size ? 0 : -1}
      >
        <CopyIcon />
      </button>
    </div>
  )
}

function formatInputDate(date: Date){
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
