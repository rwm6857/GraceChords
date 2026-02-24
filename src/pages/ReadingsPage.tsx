import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import PageHeader from '../components/ui/layout-kit/PageHeader'
import IconButton from '../components/ui/layout-kit/IconButton'
import PassageReader, { type PassageReaderHandle } from '../features/readings/PassageReader'
import { expandReadings } from '../features/readings/expandReadings'
import { addDays, getPlanForDate } from '../features/readings/useMcheyne'
import { formatPassageLabel, passageId } from '../features/readings/selection'
import type { Passage } from '../features/readings/types'
import '../features/readings/readings.css'
import { CopyIcon, ArrowLeft, ArrowRight } from '../components/Icons'
import {
  getFallbackBibleTranslations,
  listBibleTranslations,
  readBibleTranslationPreference,
  resolveBibleTranslationSelection,
  writeBibleTranslationPreference,
  type BibleTranslation,
} from '../utils/bible/translations'
import { buildBibleTranslationGroups } from '../utils/bible/translationMenu'
import BibleTranslationPicker from '../components/BibleTranslationPicker'
import { isRtlBibleLanguage } from '../utils/bible/direction'

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`

export default function ReadingsPage(){
  const [date, setDate] = useState(() => new Date())
  const [passageIndex, setPassageIndex] = useState(0)
  const [selectionsByPassage, setSelectionsByPassage] = useState<Record<string, Set<number>>>(() => ({}))
  const [translations, setTranslations] = useState<BibleTranslation[]>(() => getFallbackBibleTranslations())
  const [selectedTranslationId, setSelectedTranslationId] = useState(() => readBibleTranslationPreference())
  const readerRef = useRef<PassageReaderHandle | null>(null)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const datePickerRef = useRef<HTMLDivElement | null>(null)

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
    let cancelled = false
    async function loadTranslations(){
      const result = await listBibleTranslations()
      if (cancelled) return
      setTranslations(result.translations)
      setSelectedTranslationId((current) => (
        resolveBibleTranslationSelection(current, result.translations, result.defaultTranslationId)
      ))
    }
    loadTranslations()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedTranslationId) return
    writeBibleTranslationPreference(selectedTranslationId)
  }, [selectedTranslationId])

  const dateKey = formatInputDate(date)
  const activeTranslation = useMemo(() => (
    translations.find((item) => item.id === selectedTranslationId)
    || translations[0]
    || getFallbackBibleTranslations()[0]
  ), [translations, selectedTranslationId])
  const isRtlTranslation = useMemo(
    () => isRtlBibleLanguage(activeTranslation.language),
    [activeTranslation.language]
  )
  const selectionKey = `${dateKey}.${activeTranslation.id}`
  const translationGroups = useMemo(
    () => buildBibleTranslationGroups(translations),
    [translations]
  )

  useEffect(() => {
    setPassageIndex(0)
    setSelectionsByPassage(loadSelections(selectionKey))
  }, [planForDate.mmdd, selectionKey])

  function updateDate(next: Date){
    setDate(next)
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>){
    const val = e.target.value
    if (!val) return
    const [year, month, day] = val.split('-').map((n) => parseInt(n, 10))
    if (!year || !month || !day) return
    updateDate(new Date(year, month - 1, day))
    closeDatePicker()
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

  function closeDatePicker(){
    dateInputRef.current?.blur()
  }

  const inputDate = dateKey
  const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const currentPassageId = currentPassage ? passageId(currentPassage) : null
  const currentSelection = useMemo(() => {
    if (!currentPassageId) return new Set<number>()
    return selectionsByPassage[currentPassageId] || new Set<number>()
  }, [currentPassageId, selectionsByPassage])

  useEffect(() => {
    function onOutsidePointerDown(event: MouseEvent | TouchEvent){
      const target = event.target as Node | null
      if (!target) return
      if (datePickerRef.current?.contains(target)) return
      if (document.activeElement === dateInputRef.current) closeDatePicker()
    }
    document.addEventListener('mousedown', onOutsidePointerDown)
    document.addEventListener('touchstart', onOutsidePointerDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onOutsidePointerDown)
      document.removeEventListener('touchstart', onOutsidePointerDown)
    }
  }, [])

  return (
    <div className="readings-page">
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
        <meta property="og:url" content={`${SITE_URL}/reading`} />
        <meta property="og:site_name" content="GraceChords" />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <link rel="canonical" href={`${SITE_URL}/reading`} />
      </Helmet>
      <PageHeader
        title="Daily Bible Reading"
        subtitle="Following Robert M. M'Cheyne's plan will take you through the entire Bible in a year, including the New Testament & Psalms twice."
      />

      <section className="readings-dateblock">
        <div className="readings-date">
          <IconButton
            label="Previous day"
            className="readings-datebtn"
            onClick={() => goToRelativeDay(-1)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ArrowLeft size={14} />
          </IconButton>
          <div className="readings-translation">
            <BibleTranslationPicker
              value={activeTranslation.id}
              groups={translationGroups}
              onChange={setSelectedTranslationId}
              ariaLabel="Choose Bible translation"
            />
          </div>
          <div ref={datePickerRef} className="readings-date__picker">
            <input
              ref={dateInputRef}
              className="readings-date__input"
              type="date"
              value={inputDate}
              onChange={handleDateChange}
              onBlur={closeDatePicker}
              aria-label={`Pick date ${displayDate}`}
            />
            <button
              type="button"
              className="readings-date__button"
              onClick={openDatePicker}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={`Pick date ${displayDate}`}
            >
              {displayDate}
            </button>
          </div>
          <IconButton
            label="Next day"
            className="readings-datebtn"
            onClick={() => goToRelativeDay(1)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <ArrowRight size={14} />
          </IconButton>
        </div>
        <div className="readings-chips-nav">
          <div className="readings-chips">
            <ul className="readings-list" aria-label="Passages">
              {passages.map((passage, idx) => {
                const isActive = idx === passageIndex
                return (
                  <li key={`${passage.bookNumber}-${passage.chapter}-${idx}`}>
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
        </div>
      </section>

      {currentPassage ? (
        <>
          <PassageReader
            ref={readerRef}
            passage={currentPassage}
            translationId={activeTranslation.id}
            translationLabel={activeTranslation.label}
            translationLanguage={activeTranslation.language}
            selection={currentSelection}
            onSelectionChange={(next) => {
              if (!currentPassageId) return
              setSelectionsByPassage((prev) => {
                const updated = { ...prev }
                if (next.size) updated[currentPassageId] = next
                else delete updated[currentPassageId]
                persistSelections(selectionKey, updated)
                return updated
              })
            }}
            onNavigate={(direction) => goToPassage(direction === 'next' ? 1 : -1)}
          />
        </>
      ) : (
        <div className="gc-card readings-status readings-status--error">No passages found for this day.</div>
      )}

      <button
        type="button"
        className={`readings-copy-fab ${currentSelection.size ? 'is-visible' : ''} ${isRtlTranslation ? 'is-rtl' : ''}`.trim()}
        onClick={() => readerRef.current?.copy()}
        aria-label="Copy selected verses"
        aria-hidden={!currentSelection.size}
        tabIndex={currentSelection.size ? 0 : -1}
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

function loadSelections(dateKey: string){
  if (typeof window === 'undefined') return {}
  const key = storageKey(dateKey)
  const raw = window.localStorage.getItem(key)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.date !== dateKey || typeof parsed.passages !== 'object') return {}
    const result: Record<string, Set<number>> = {}
    for (const [pid, verses] of Object.entries(parsed.passages)){
      if (!Array.isArray(verses)) continue
      result[pid] = new Set(verses.map((v) => Number(v)).filter((v) => !Number.isNaN(v)))
    }
    return result
  } catch {
    return {}
  }
}

function persistSelections(dateKey: string, selections: Record<string, Set<number>>){
  if (typeof window === 'undefined') return
  const payload = {
    version: 1,
    date: dateKey,
    passages: Object.fromEntries(
      Object.entries(selections).map(([pid, set]) => [
        pid,
        Array.from(set).sort((a, b) => a - b),
      ])
    ),
  }
  window.localStorage.setItem(storageKey(dateKey), JSON.stringify(payload))
}

function storageKey(dateKey: string){
  return `gracechords.reading.selection.v1.${dateKey}`
}
