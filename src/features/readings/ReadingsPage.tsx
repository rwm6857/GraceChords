import React, { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/ui/layout-kit/PageHeader'
import Toolbar from '../../components/ui/layout-kit/Toolbar'
import PassageReader from './PassageReader'
import { expandReadings } from './expandReadings'
import { addDays, getPlanForDate } from './useMcheyne'
import { formatPassageLabel } from './selection'
import type { Passage } from './types'
import './readings.css'

export default function ReadingsPage(){
  const [date, setDate] = useState(() => new Date())
  const [passageIndex, setPassageIndex] = useState(0)
  const [selection, setSelection] = useState<Set<number>>(new Set())

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

  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const inputDate = formatInputDate(date)
  const passageLabel = currentPassage ? formatPassageLabel(currentPassage) : 'No passage'

  return (
    <div className="container readings-page">
      <PageHeader title="Daily Bible Readings" subtitle="M\u2019Cheyne plan · Local ESV XML">
        <p className="readings-sub">Plan day {planForDate.mmdd}</p>
      </PageHeader>

      <Toolbar className="readings-toolbar">
        <div className="readings-date">
          <button type="button" className="gc-btn gc-btn--tertiary" onClick={() => goToRelativeDay(-1)}>Yesterday</button>
          <label className="readings-date__picker">
            <span className="sr-only">Select date</span>
            <input type="date" value={inputDate} onChange={handleDateChange} aria-label="Pick date" />
          </label>
          <button type="button" className="gc-btn gc-btn--tertiary" onClick={() => goToRelativeDay(1)}>Tomorrow</button>
        </div>
        <div className="readings-date__label">{dateLabel}</div>
      </Toolbar>

      <Toolbar className="readings-toolbar">
        <button type="button" className="gc-btn gc-btn--icon" onClick={() => goToPassage(-1)} aria-label="Previous passage">&lt;</button>
        <div className="readings-passagename" aria-live="polite">
          {passageLabel}
          {passages.length ? <span className="readings-count">({passageIndex + 1}/{passages.length})</span> : null}
        </div>
        <button type="button" className="gc-btn gc-btn--icon" onClick={() => goToPassage(1)} aria-label="Next passage">&gt;</button>
      </Toolbar>

      <section className="readings-summary">
        <h2 className="readings-summary__title">Today&apos;s readings</h2>
        <ul className="readings-list">
          {planForDate.readings.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      {currentPassage ? (
        <PassageReader
          passage={currentPassage}
          selection={selection}
          onSelectionChange={setSelection}
        />
      ) : (
        <div className="gc-card readings-status readings-status--error">No passages found for this day.</div>
      )}
    </div>
  )
}

function formatInputDate(date: Date){
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
