import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/layout-kit'
import BibleTranslationPicker from '../../components/BibleTranslationPicker'
import { parseVerseReference, suggestBookName } from '../../utils/songs/verseRef'
import { fetchBibleChapter } from '../../utils/bible/chapters'
import {
  getFallbackBibleTranslations,
  listBibleTranslations,
  readBibleTranslationPreference,
  resolveBibleTranslationSelection,
  writeBibleTranslationPreference,
} from '../../utils/bible/translations'
import { buildBibleTranslationGroups } from '../../utils/bible/translationMenu'

// Split a typed reference into its book part and the chapter:verse part, so a
// partial book name can be completed without discarding what follows it.
function splitVerseInput(input) {
  const raw = String(input || '')
  if (!raw.trim()) return { bookPart: '', refPart: '' }
  const colonIndex = raw.indexOf(':')
  if (colonIndex > -1) {
    let i = colonIndex - 1
    while (i >= 0 && /\d/.test(raw[i])) i -= 1
    const digitStart = i + 1
    if (digitStart < colonIndex) {
      return { bookPart: raw.slice(0, digitStart).trim(), refPart: raw.slice(digitStart).trim() }
    }
  }
  const match = raw.match(/\s(\d+)(?=[\s:.,-]|$)/)
  if (match && typeof match.index === 'number') {
    return {
      bookPart: raw.slice(0, match.index).trim(),
      refPart: raw.slice(match.index + 1).trim(),
    }
  }
  return { bookPart: raw.trim(), refPart: '' }
}

function buildVerseCompletion(input, suggestion) {
  if (!suggestion) return null
  const raw = String(input || '')
  if (!raw.trim()) return null
  const { bookPart, refPart } = splitVerseInput(raw)
  if (!bookPart) return null
  const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const composed = refPart ? `${suggestion} ${refPart}` : `${suggestion} `
  if (!normalize(composed).startsWith(normalize(raw))) return null
  if (composed.length <= raw.length) return null
  return { composed, remainder: composed.slice(raw.length) }
}

export default function AddVerseDialog({ open, onClose, onAdd, verseCache }) {
  const { t } = useTranslation('pages')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [suggest, setSuggest] = useState('')
  const [busy, setBusy] = useState(false)
  const [translations, setTranslations] = useState(() => getFallbackBibleTranslations())
  const [translation, setTranslation] = useState(() => readBibleTranslationPreference())

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    listBibleTranslations()
      .then((list) => {
        if (cancelled || !list?.length) return
        setTranslations(list)
        setTranslation((current) => resolveBibleTranslationSelection(list, current))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setSuggest(suggestBookName(splitVerseInput(input).bookPart) || '')
  }, [input, open])

  if (!open) return null

  const completion = buildVerseCompletion(input, suggest)

  async function validate(parsed) {
    if (!parsed?.book || !parsed?.segments?.length) {
      return { ok: false, message: t('setlist.checkVerse') }
    }
    async function loadChapter(chapter) {
      const key = `${parsed.translation}::${parsed.bookNumber}::${chapter}`
      if (verseCache.has(key)) return verseCache.get(key)
      try {
        const json = await fetchBibleChapter({
          translationId: parsed.translation,
          book: String(parsed.bookNumber),
          chapter,
        })
        verseCache.set(key, json)
        return json
      } catch {
        verseCache.set(key, null)
        return null
      }
    }

    let foundAny = false
    for (const segment of parsed.segments) {
      const chapterData = await loadChapter(segment.chapter)
      if (!chapterData?.verses) return { ok: false, message: t('setlist.noVerseFound') }
      const verseMap = chapterData.verses
      if (!segment.ranges) {
        if (Object.keys(verseMap).length) foundAny = true
        continue
      }
      for (const range of segment.ranges) {
        const end = range.end ?? range.start
        if (!verseMap[String(range.start)] || !verseMap[String(end)]) {
          return { ok: false, message: t('setlist.checkVerse') }
        }
        foundAny = true
      }
    }
    if (!foundAny) return { ok: false, message: t('setlist.noVerseFound') }
    return { ok: true }
  }

  async function submit() {
    if (busy) return
    const parsed = parseVerseReference(input, { translation })
    if (parsed.error) {
      setError(t('setlist.checkVerse'))
      return
    }
    setBusy(true)
    const check = await validate(parsed)
    setBusy(false)
    if (!check.ok) {
      setError(check.message)
      return
    }
    onAdd(parsed.id)
    setInput('')
    setError('')
    onClose()
  }

  return (
    <div className="gc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gc-verse-title">
      <div className="gc-modal gc-verse-modal">
        <h2 id="gc-verse-title">{t('setlist.addVerseTitle')}</h2>

        <div className="gc-verse-grid">
          <label className="gc-label" htmlFor="gc-verse-input">
            {t('setlist.bibleVerse')}
          </label>
          <label className="gc-label" htmlFor="gc-verse-translation">
            {t('setlist.translation')}
          </label>

          <div className="gc-verse-field">
            {completion ? (
              <div className="gc-verse-ghost" aria-hidden="true">
                <span className="gc-verse-ghost-typed">{input}</span>
                <span className="gc-verse-ghost-rest">{completion.remainder}</span>
              </div>
            ) : null}
            <input
              id="gc-verse-input"
              className="gc-input"
              value={input}
              placeholder={t('setlist.versePlaceholder')}
              autoFocus
              onChange={(e) => {
                setInput(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && completion) {
                  e.preventDefault()
                  setInput(completion.composed)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  onClose()
                }
              }}
            />
          </div>

          <BibleTranslationPicker
            id="gc-verse-translation"
            groups={buildBibleTranslationGroups(translations)}
            value={translation}
            ariaLabel={t('setlist.translationAria')}
            fullWidth
            onChange={(next) => {
              setTranslation(next)
              writeBibleTranslationPreference(next)
            }}
          />
        </div>

        {error ? <p className="gc-verse-error">{error}</p> : null}

        <div className="gc-modal-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('setlist.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {t('setlist.addVerse')}
          </Button>
        </div>
      </div>
    </div>
  )
}
