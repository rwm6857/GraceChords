import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import PageHeader from '../ui/layout-kit/PageHeader'
import IconButton from '../ui/layout-kit/IconButton'
import PassageReader, { type PassageReaderHandle } from './PassageReader'
import { expandReadings } from './expandReadings'
import { addDays, getPlanForDate } from './useMcheyne'
import { formatPassageLabel } from './selection'
import type { Passage } from './types'
import './readings.css'
import { CopyIcon, ArrowLeft, ArrowRight } from '../Icons'

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`

export default function ReadingsPage(){
  const [date, setDate] = useState(() => new Date())
  const [passageIndex, setPassageIndex] = useState(0)
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const readerRef = useRef<PassageReaderHandle | null>(null)

  const planForDate = useMemo(() => getPlanForDate(date), [date])
  const passages = useMemo(() => expandReadings(planForDate.readings), [planForDate.readings])
  const currentPassage: Passage | null = passages[passageIndex] || null

  useEffect(() => {
    const root = document.getElementById('root')
    const main = document.getElementById('main')
    root?.classList.add('readings-root')
    main?.classList.add('readings-route')
    return () => {
      root?.classList.remove('readings-root')
      main?.classList.remove('readings-route')
    }
  }, [])

  useEffect(() => {
    setPassageIndex(0)
    setSelection(new Set())
  }, [planForDate.mmdd])

  useEffect(() => {
    setSelection(new Set())
  }, [passageIndex])

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
      <Helmet>
        <title>GraceChords — Daily Word</title>
        <meta
          name="description"
          content="Daily Bible reading following Robert Murray M'Cheyne's plan, taking you through the whole Bible in a year. Global Alliance Prayer (GAP) invites you to read, meditate, and pray with your church and family."
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="GraceChords — Daily Word" />
        <meta
          property="og:description"
          content="Daily Bible reading following Robert Murray M'Cheyne's plan. Global Alliance Prayer (GAP) invites you to read, meditate, and pray together."
        />
        <meta property="og:url" content={`${SITE_URL}/readings`} />
        <meta property="og:site_name" content="GraceChords" />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <link rel="canonical" href={`${SITE_URL}/readings`} />
      </Helmet>
      <PageHeader
        title="Daily Bible Reading"
        subtitle="Reading the Bible following Robert Murray M'Cheyne's plan will take you through the entire Bible in a year, including the New Testament & Psalms twice. Read, meditate, and pray over the word in your church and family worship."
      />

      <section className="readings-dateblock">
        <div className="readings-date">
          <IconButton
            label="Previous day"
            className="readings-datebtn"
            onClick={() => goToRelativeDay(-1)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ArrowLeft size={16} />
          </IconButton>
          <label className="readings-date__picker">
            <span className="sr-only">Select date</span>
            <input type="date" value={inputDate} onChange={handleDateChange} aria-label="Pick date" />
          </label>
          <IconButton
            label="Next day"
            className="readings-datebtn"
            onClick={() => goToRelativeDay(1)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ArrowRight size={16} />
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
                    onMouseDown={(e) => e.preventDefault()}
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
