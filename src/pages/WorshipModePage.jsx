import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import indexData from '../data/index.json'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { stepsBetween, transposeSym, transposeSymPrefer, KEYS, keyRoot, formatKey } from '../utils/chordpro'
import KeySelector from '../components/KeySelector'
import { transposeInstrumental, formatInstrumental } from '../utils/songs/instrumental'
import { applyTheme, currentTheme, toggleTheme } from '../utils/app/theme'
import { Sun, Moon, PlusIcon, OneColIcon, TwoColIcon, HomeIcon, EyeIcon, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RemoveIcon, SlidersIcon, PlayIcon, PauseIcon, ResetIcon } from '../components/Icons'
import { resolveChordCollisions } from '../utils/songs/chords'
import { publicUrl } from '../utils/network/publicUrl'
import { isVerseId, parseVerseId } from '../utils/songs/verseRef'
import { fetchBibleChapter } from '../utils/bible/chapters'
import {
  buildSongCatalog,
  resolveGroupEntry,
  resolveInitialSongLanguage,
} from '../utils/songs/songCatalog'

const PT_WINDOW = [18, 17, 16, 15, 14]
const SESSION_KEY = 'worship:session'
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

function safeDecodeURIComponent(value){
  try { return decodeURIComponent(value) } catch { return value }
}

export default function WorshipMode(){
  const { songIds = '' } = useParams()
  const navigate = useNavigate()
  const ids = useMemo(() => songIds.split(',').map(s => safeDecodeURIComponent(s.trim())).filter(Boolean), [songIds])
  const catalog = useMemo(() => buildSongCatalog(indexData?.items || []), [])
  const allSongsById = catalog.byId
  const selectedLanguage = useMemo(
    () => resolveInitialSongLanguage(catalog.translationLanguages?.length ? catalog.translationLanguages : catalog.allLanguages),
    [catalog]
  )

  const [songs, setSongs] = useState([]) // [{ id, title, baseKey, sections, type }]
  const [idx, setIdx] = useState(0)
  const [transpose, setTranspose] = useState(0)
  const [songOffsets, setSongOffsets] = useState([]) // per-song current offsets (semitones)
  const [baseOffsets, setBaseOffsets] = useState([]) // per-song baseline offsets at session start
  const [showChords, setShowChords] = useState(true)
  const [halfStep, setHalfStep] = useState(false)
  const [openSettings, setOpenSettings] = useState(false)
  const [fontPx, setFontPx] = useState(null)
  const [autoSize, setAutoSize] = useState(() => fontPx == null)
  // Clock + Stopwatch settings (persist)
  const [clock24h, setClock24h] = useState(() => { try { return localStorage.getItem('worship:clock24h') === '1' } catch { return false } })
  const [showStopwatch, setShowStopwatch] = useState(() => { try { return localStorage.getItem('worship:showStopwatch') !== '0' } catch { return true } })

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const headerRef = useRef(null)
  const barRef = useRef(null)
  const touchRef = useRef({ x: 0, y: 0, at: 0 })
  const [cols, setCols] = useState(() => { try { return (window.innerWidth < 768) ? 1 : 2 } catch { return 2 } })
  const [isWide, setIsWide] = useState(() => {
    try { const vw = window.innerWidth, vh = window.innerHeight; return (vw >= 900) || (vw / Math.max(1, vh) >= 1.2) } catch { return false }
  })
  const [isMobile, setIsMobile] = useState(() => { try { return window.innerWidth < 768 } catch { return false } })
  const [, setThemeBump] = useState(0)
  const [availH, setAvailH] = useState(null)
  const [showSwipeHint, setShowSwipeHint] = useState(false)
  const hintTimerRef = useRef(0)
  // Clock + Stopwatch runtime
  const [now, setNow] = useState(() => new Date())
  const [elapsedSec, setElapsedSec] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const stopwatchStartRef = useRef(0)

  // Quick add/search state
  const [q, setQ] = useState('')
  const [openSuggest, setOpenSuggest] = useState(false)
  const searchRef = useRef(null)
  const quickAddItems = useMemo(() => {
    const out = []
    for (const group of catalog.groups || []) {
      const display = resolveGroupEntry(group, selectedLanguage)
      if (!display) continue
      out.push({
        ...display,
        searchTitles: group.variants.map((v) => v.title || '').filter(Boolean),
      })
    }
    return out
  }, [catalog.groups, selectedLanguage])
  const titleResults = useMemo(() => {
    if (!q.trim()) return []
    const s = q.trim().toLowerCase()
    return quickAddItems
      .filter((it) => {
        const title = String(it.title || '').toLowerCase()
        if (title.includes(s)) return true
        return (it.searchTitles || []).some((t) => String(t || '').toLowerCase().includes(s))
      })
      .slice(0, 5)
  }, [q, quickAddItems])

  // Close suggestions on outside click/tap
  useEffect(() => {
    function onPointerDown(e){
      const host = searchRef.current
      if (!host) return
      if (host.contains(e.target)) return
      setOpenSuggest(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])
  // Close suggestions on Escape
  useEffect(() => {
    function onKeyDown(e){ if (e.key === 'Escape') setOpenSuggest(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function onResize(){
      try {
        const vw = window.innerWidth, vh = window.innerHeight
        setIsWide((vw >= 900) || (vw / Math.max(1, vh) >= 1.2))
        setIsMobile(vw < 768)
        const vp = viewportRef.current
        const headerH = headerRef.current?.offsetHeight || 0
        const barH = barRef.current?.offsetHeight || 0
        const h = (vp?.clientHeight || vh) - headerH - barH
        setAvailH(Math.max(0, h))
      } catch {}
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Persist settings
  useEffect(() => { try { localStorage.setItem('worship:clock24h', clock24h ? '1' : '0') } catch {} }, [clock24h])
  useEffect(() => { try { localStorage.setItem('worship:showStopwatch', showStopwatch ? '1' : '0') } catch {} }, [showStopwatch])

  // Clock: tick on minute boundary
  useEffect(() => {
    let t1 = null, t2 = null
    const tick = () => setNow(new Date())
    const ms = 60000 - (Date.now() % 60000)
    t1 = setTimeout(() => { tick(); t2 = setInterval(tick, 60000) }, ms)
    tick()
    return () => { if (t1) clearTimeout(t1); if (t2) clearInterval(t2) }
  }, [])

  // Stopwatch: manual start/stop, default stopped at 00:00
  useEffect(() => {
    let id = null
    if (isRunning) {
      if (!stopwatchStartRef.current) {
        stopwatchStartRef.current = Date.now()
      }
      id = setInterval(() => {
        const start = stopwatchStartRef.current || Date.now()
        setElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)))
      }, 1000)
    }
    return () => { if (id) clearInterval(id) }
  }, [isRunning])

  // Restore stopwatch from sessionStorage on mount (reload case only)
  useEffect(() => {
    try {
      const run = sessionStorage.getItem('worship:sw:running') === '1'
      const startAt = Number(sessionStorage.getItem('worship:sw:startAt') || '0') || 0
      const savedElapsed = Number(sessionStorage.getItem('worship:sw:elapsed') || '0') || 0
      if (run && startAt > 0) {
        stopwatchStartRef.current = startAt
        const nowMs = Date.now()
        setElapsedSec(Math.max(0, Math.floor((nowMs - startAt) / 1000)))
        setIsRunning(true)
      } else if (!run && savedElapsed > 0) {
        setElapsedSec(savedElapsed)
        setIsRunning(false)
        stopwatchStartRef.current = 0
      }
    } catch {}
  }, [])

  // Persist stopwatch state into sessionStorage for reload recovery
  useEffect(() => {
    try {
      sessionStorage.setItem('worship:sw:running', isRunning ? '1' : '0')
      sessionStorage.setItem('worship:sw:elapsed', String(elapsedSec))
      if (isRunning && stopwatchStartRef.current) {
        sessionStorage.setItem('worship:sw:startAt', String(stopwatchStartRef.current))
      }
    } catch {}
  }, [isRunning, elapsedSec])

  // Clear stopwatch stored state when navigating away (component unmount)
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem('worship:sw:running')
        sessionStorage.removeItem('worship:sw:elapsed')
        sessionStorage.removeItem('worship:sw:startAt')
      } catch {}
    }
  }, [])

  function toggleStopwatch(){
    if (isRunning) {
      setIsRunning(false)
    } else {
      // resume from current elapsed
      stopwatchStartRef.current = Date.now() - (elapsedSec * 1000)
      setIsRunning(true)
    }
  }
  function resetStopwatch(){
    setIsRunning(false)
    setElapsedSec(0)
    stopwatchStartRef.current = 0
  }

  // Auto-stop and reset when hiding the stopwatch
  useEffect(() => {
    if (!showStopwatch) {
      setIsRunning(false)
      setElapsedSec(0)
      stopwatchStartRef.current = 0
    }
  }, [showStopwatch])

  function formatClock(d){
    const h = d.getHours(); const m = d.getMinutes()
    if (clock24h) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    const hr12 = h % 12 || 12; const ap = (h >= 12) ? 'pm' : 'am'
    return `${hr12}:${String(m).padStart(2,'0')}${ap}`
  }
  function formatStopwatch(sec){
    const s = sec % 60, m = Math.floor(sec/60) % 60, h = Math.floor(sec/3600)
    const ss = String(s).padStart(2,'0'); const mm = String(m).padStart(2,'0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  const location = useLocation()
  const query = useMemo(() => {
    const qs = new URLSearchParams(location.search || '')
    return {
      toKey: qs.get('toKey') || '',
      toKeys: (qs.get('toKeys') || '').split(',').map(s => safeDecodeURIComponent(s)),
    }
  }, [location.search])

  const setlistUrl = useMemo(() => {
    if (!ids.length) return '/setlist'
    const encodedIds = ids.map((id) => encodeURIComponent(id)).join(',')
    const keys = (query.toKeys && query.toKeys.length === ids.length)
      ? query.toKeys
      : ids.map(() => '')
    const encodedKeys = keys.map(k => encodeURIComponent(k || '')).join(',')
    return `/setlist/${encodedIds}?toKeys=${encodedKeys}`
  }, [ids.join('|'), query.toKeys.join('|')])

  // Load songs by ids
  useEffect(() => {
    let cancelled = false
    async function load(){
      // Attempt to restore session for this route
      let saved = null
      try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch {}
      const idsString = ids.join(',')
      const canRestore = !!(saved && saved.idsString === idsString && (Date.now() - (saved.ts || 0) <= SESSION_TTL_MS))

      const out = []
      const chapterCache = new Map()

      async function loadChapter(translationId, book, chapter){
        const key = `${translationId}::${book}::${chapter}`
        if (chapterCache.has(key)) return chapterCache.get(key)
        try {
          const json = await fetchBibleChapter({ translationId, book, chapter })
          chapterCache.set(key, json)
          return json
        } catch (err) {
          console.error(err)
          chapterCache.set(key, null)
          return null
        }
      }

      function listChapterVerses(chapterData){
        return Object.keys(chapterData?.verses || {})
          .map((n) => Number(n))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => a - b)
      }

      function buildVerseLines(chapterData, segment){
        const all = listChapterVerses(chapterData)
        if (!segment.ranges) return all
        const max = all.length ? all[all.length - 1] : 0
        const outNums = []
        for (const range of segment.ranges) {
          const start = range.start
          const end = range.end == null ? max : range.end
          for (let v = start; v <= end; v += 1) {
            if (chapterData?.verses?.[String(v)]) outNums.push(v)
          }
        }
        return outNums
      }

      for (const id of ids) {
        if (isVerseId(id)) {
          const parsed = parseVerseId(id)
          if (!parsed) continue
          const segments = parsed.segments || []
          const multiChapter = segments.length > 1
          const lines = []
          for (const segment of segments) {
            const chapterData = await loadChapter(parsed.translation, String(parsed.bookNumber), segment.chapter)
            if (!chapterData) continue
            const nums = buildVerseLines(chapterData, segment)
            for (const num of nums) {
              lines.push({
                verse: true,
                chapter: segment.chapter,
                number: num,
                text: chapterData.verses[String(num)] || '',
                showChapter: multiChapter,
              })
            }
          }
          out.push({
            id: parsed.id,
            title: parsed.refDisplay,
            baseKey: null,
            type: 'verse',
            sections: [{ label: '', lines }],
          })
          continue
        }
        const s = allSongsById.get(String(id))
        if (!s) continue
        try {
          const res = await fetch(publicUrl(`songs/${s.filename}`))
          if (!res.ok) throw new Error(`Failed ${s.filename}`)
          const txt = await res.text()
          const doc = parseChordProOrLegacy(txt)
          const title = doc?.meta?.title || s.title || s.id
          const baseKey = doc?.meta?.key || doc?.meta?.originalkey || s.originalKey || 'C'
          const sections = (doc.sections || []).map((sec) => ({
            label: sec.label,
            lines: (sec.lines || []).map((ln) => {
              if (ln.instrumental) {
                return {
                  plain: '',
                  chords: [],
                  comment: false,
                  instrumental: ln.instrumental,
                };
              }
              if (ln.comment) {
                return {
                  plain: ln.comment,
                  chords: [],
                  comment: true,
                };
              }
              return {
                plain: ln.lyrics || '',
                chords: ln.chords || [],
                comment: false,
              };
            }),
          }))
          out.push({ id: s.id, title, baseKey, sections, type: 'song' })
          // offsets computed after load
        } catch (err) {
          console.error(err)
        }
      }
      if (!cancelled) {
        // Compute baseline offsets from query
        let baseOffs = out.map(() => 0)
        let offs = out.map(() => 0)
        if (query.toKeys && query.toKeys.length === out.length) {
          baseOffs = out.map((song, i) => {
            if (song?.type === 'verse') return 0
            const targetKey = query.toKeys[i]
            if (!targetKey) return 0
            return stepsBetween(song.baseKey, targetKey)
          })
          offs = baseOffs.slice()
        } else if (query.toKey && out.length === 1 && out[0]?.type !== 'verse') {
          baseOffs = [stepsBetween(out[0].baseKey, query.toKey)]
          offs = baseOffs.slice()
        }

        // Restore from session if recent, unless explicit keys were provided
        const hasQueryKeys = (query.toKeys && query.toKeys.length === out.length) || (query.toKey && out.length === 1)
        let startIdx = 0
        if (canRestore) {
          try {
            if (!hasQueryKeys) {
              if (Array.isArray(saved.baseOffsets) && saved.baseOffsets.length === out.length) baseOffs = saved.baseOffsets
              if (Array.isArray(saved.offsets) && saved.offsets.length === out.length) offs = saved.offsets
              if (typeof saved.idx === 'number') startIdx = Math.max(0, Math.min(out.length - 1, saved.idx))
            }
            if (typeof saved.cols === 'number') setCols(saved.cols)
            if (typeof saved.fontPx === 'number') { setFontPx(saved.fontPx); setAutoSize(false) }
            if (typeof saved.autoSize === 'boolean') setAutoSize(saved.autoSize)
            if (typeof saved.showChords === 'boolean') setShowChords(saved.showChords)
            if (typeof saved.halfStep === 'boolean') setHalfStep(saved.halfStep)
          } catch {}
        }

        setSongs(out)
        setBaseOffsets(baseOffs)
        setSongOffsets(offs)
        setIdx(startIdx)
        const initial = out[startIdx]
        setTranspose(initial?.type === 'verse' ? 0 : (offs[startIdx] ?? baseOffs[startIdx] ?? 0))
        // Mobile swipe hint once per device
        try {
          const seen = localStorage.getItem('worship:swipeHintShown') === '1'
          if (!seen && (typeof window !== 'undefined') && (window.innerWidth < 768)) {
            setShowSwipeHint(true)
            localStorage.setItem('worship:swipeHintShown', '1')
            hintTimerRef.current = setTimeout(() => setShowSwipeHint(false), 3000)
          }
        } catch {}
      }
    }
    load()
    return () => { cancelled = true }
  }, [songIds, query.toKey, query.toKeys.join('|'), allSongsById])

  // Clear pending swipe-hint timer on unmount
  useEffect(() => {
    return () => { if (hintTimerRef.current) { clearTimeout(hintTimerRef.current); hintTimerRef.current = 0 } }
  }, [])

  // Fit-to-viewport with column preference: on wide screens, prefer 2 columns to keep larger text.
  useEffect(() => {
    if (!autoSize) return
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const forceSingle = songs[idx]?.type === 'verse'

    const prevSize = content.style.fontSize
    const prevCols = content.style.columnCount
    const prevGap = content.style.columnGap
    try {
      const colPref = forceSingle ? [1] : (isMobile ? [1, 2] : [2, 1])
      for (const pt of PT_WINDOW) {
        for (const cc of colPref) {
          content.style.fontSize = `${pt}px`
          content.style.columnCount = String(cc)
          content.style.columnGap = cc === 2 ? '20px' : '0px'
          // Force reflow
          // eslint-disable-next-line no-unused-expressions
          content.offsetHeight
          const headerH = headerRef.current?.offsetHeight || 0
          const barH = barRef.current?.offsetHeight || 0
          const fits = content.scrollHeight <= (viewport.clientHeight - headerH - barH)
          if (fits) {
            setCols(cc)
            setFontPx(pt)
            return
          }
        }
      }
      // Fallback to smallest size and preferred columns
      setCols(colPref[0])
      setFontPx(PT_WINDOW[PT_WINDOW.length - 1])
    } finally {
      content.style.fontSize = prevSize
      content.style.columnCount = prevCols
      content.style.columnGap = prevGap
    }
  }, [songs, idx, autoSize, showChords, isWide])

  // When manually changing font size, allow auto switch in both directions.
  useEffect(() => {
    if (autoSize) return
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const forceSingle = songs[idx]?.type === 'verse'
    if (forceSingle) {
      setCols(1)
      return
    }
    const prevSize = content.style.fontSize
    const prevCols = content.style.columnCount
    const prevGap = content.style.columnGap
    try {
      // First try current columns
      content.style.fontSize = `${fontPx || 20}px`
      content.style.columnCount = String(cols)
      content.style.columnGap = cols === 2 ? '20px' : '0px'
      // eslint-disable-next-line no-unused-expressions
      content.offsetHeight
      const headerH = headerRef.current?.offsetHeight || 0
      const barH = barRef.current?.offsetHeight || 0
      const avail = (viewport.clientHeight - headerH - barH)
      if (content.scrollHeight <= avail) {
        // If fits, and currently 2 columns, test whether 1 column also fits at this size; if so prefer 1
        if (cols === 2) {
          content.style.columnCount = '1'
          content.style.columnGap = '0px'
          // eslint-disable-next-line no-unused-expressions
          content.offsetHeight
          if (content.scrollHeight <= avail) setCols(1)
        }
        return
      }
      // Not fitting: try two columns
      content.style.columnCount = '2'
      content.style.columnGap = '20px'
      // eslint-disable-next-line no-unused-expressions
      content.offsetHeight
      if (content.scrollHeight <= avail) setCols(2)
    } finally {
      content.style.fontSize = prevSize
      content.style.columnCount = prevCols
      content.style.columnGap = prevGap
    }
  }, [fontPx, autoSize, cols, idx, songs])

  // Keep transpose in sync when song changes
  useEffect(() => {
    const entry = songs[idx]
    if (entry?.type === 'verse') {
      setTranspose(0)
      return
    }
    setTranspose((songOffsets[idx] ?? baseOffsets[idx] ?? 0))
  }, [idx, songs])
  // Persist session for accidental refresh recovery
  useEffect(() => {
    const payload = {
      idsString: ids.join(','),
      idx,
      offsets: songOffsets,
      baseOffsets,
      cols,
      fontPx,
      autoSize,
      showChords,
      halfStep,
      ts: Date.now(),
    }
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload)) } catch {}
  }, [ids.join(','), idx, songOffsets, baseOffsets, cols, fontPx, autoSize, showChords, halfStep])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e){
      const tag = (e.target && e.target.tagName) || ''
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, songs])

  // Touch navigation
  function onTouchStart(e){
    const t = e.changedTouches && e.changedTouches[0]
    if (!t) return
    touchRef.current = { x: t.clientX, y: t.clientY, at: Date.now() }
  }
  function onTouchEnd(e){
    const t0 = touchRef.current
    const t = e.changedTouches && e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - t0.x
    const dy = t.clientY - t0.y
    const dt = Date.now() - t0.at
    if (dt < 800 && Math.abs(dx) > Math.max(60, Math.abs(dy) * 1.6)){
      if (dx < 0) next(); else prev()
      return
    }
    if (dt < 500 && Math.abs(dy) > Math.max(90, Math.abs(dx) * 1.8)){
      if (dy < 0) shiftKey(1); else shiftKey(-1)
    }
  }

  function next(){ setQ(''); setOpenSuggest(false); setIdx(i => Math.min((songs.length - 1), i + 1)) }
  function prev(){ setQ(''); setOpenSuggest(false); setIdx(i => Math.max(0, i - 1)) }
  function shiftKey(dir){
    if (songs[idx]?.type === 'verse') return
    setTranspose(t => {
      const step = (halfStep ? 1 : 2)
      const nt = t + (dir * step)
      setSongOffsets(arr => { const c = arr.slice(); c[idx] = nt; return c })
      return nt
    })
  }

  async function addSongAfterCurrent(idToAdd){
    try {
      const entry = allSongsById.get(String(idToAdd))
      if (!entry) return
      const res = await fetch(publicUrl(`songs/${entry.filename}`))
      if (!res.ok) return
      const txt = await res.text()
      const doc = parseChordProOrLegacy(txt)
      const title = doc?.meta?.title || entry.title || entry.id
      const baseKey = doc?.meta?.key || doc?.meta?.originalkey || entry.originalKey || 'C'
      const sections = (doc.sections || []).map(sec => ({
        label: sec.label,
        lines: (sec.lines || []).map(ln => ({
          plain: ln.instrumental ? '' : (ln.comment ? ln.comment : (ln.lyrics || '')),
          chords: ln.instrumental ? [] : (ln.chords || []),
          comment: !!ln.comment,
          instrumental: ln.instrumental,
        }))
      }))
      // Insert after current index
      setSongs(prev => {
        const copy = prev.slice()
        copy.splice(Math.min(prev.length, idx + 1), 0, { id: entry.id, title, baseKey, sections, type: 'song' })
        // Update URL for persistence
        const newIds = copy.map(s => encodeURIComponent(s.id))
        navigate(`/worship/${newIds.join(',')}`)
        return copy
      })
      setBaseOffsets(prev => {
        const copy = prev.slice()
        copy.splice(Math.min(prev.length, idx + 1), 0, 0)
        return copy
      })
      setSongOffsets(prev => {
        const copy = prev.slice()
        copy.splice(Math.min(prev.length, idx + 1), 0, 0)
        return copy
      })
      setQ(''); setOpenSuggest(false)
    } catch (err) {
      console.error(err)
    }
  }

  const cur = songs[idx]
  const isVerse = cur?.type === 'verse'
  const toKey = useMemo(() => (cur && !isVerse ? transposeSymPrefer(cur.baseKey, transpose, false) : ''), [cur?.baseKey, transpose, isVerse])
  const baseRootRaw = (!isVerse && cur?.baseKey ? String(cur.baseKey).match(/^([A-G][#b]?)/)?.[1] : '')
  const preferFlat = !!(baseRootRaw && /b$/.test(baseRootRaw))
  const steps = useMemo(() => (!isVerse && cur ? stepsBetween(cur.baseKey, toKey) : 0), [cur?.baseKey, toKey, isVerse])
  const displayCols = isVerse ? 1 : cols

  useEffect(() => {
    // Ensure theme attribute applied so background matches choice
    applyTheme(currentTheme(), { persist: false })
  }, [])

  if (!ids.length){
    return (
      <div className="WorshipRoot" style={{display:'grid', placeItems:'center', minHeight:'100dvh'}}>
        <div style={{textAlign:'center'}}>
          <h1>Worship Mode</h1>
          <p>No songs provided. Append /worship/id1,id2 to the URL.</p>
          <button className="gc-btn" onClick={() => navigate('/')}>Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="WorshipRoot" style={{minHeight:'100dvh', background:'var(--bg)', color:'var(--text)'}}>
      <div
        ref={viewportRef}
        className="worship__viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position:'fixed', inset:0, overflow:'hidden',
          display:'flex', flexDirection:'column',
          background:'var(--bg)', color:'var(--text)'
        }}
      >
        {/* Title row: Stopwatch — Title — Clock */}
        <div ref={headerRef} style={{padding:'10px 16px', textAlign:'center'}}>
          <TitleStrip
            title={cur?.title || ''}
            clockText={formatClock(now)}
            stopwatchText={showStopwatch ? formatStopwatch(elapsedSec) : ''}
            showStopwatch={showStopwatch}
            isRunning={isRunning}
            onToggleRun={toggleStopwatch}
            onReset={resetStopwatch}
            canReset={elapsedSec > 0}
            sizeCss="clamp(20px, 4vw, 28px)"
          />
          {!isVerse && (() => {
            const base = cur?.baseKey || ''
            const baseRootRaw = (String(base).match(/^([A-G][#b]?)/) || [,''])[1]
            const preferFlat = !!(baseRootRaw && /b$/.test(baseRootRaw))
            const display = formatKey(toKey, preferFlat ? 'flat' : 'sharp')
            return (
              <div style={{opacity:.75, fontSize:16, marginTop:2}}>
                Key: {display}{(cur?.baseKey && toKey !== cur.baseKey) ? ` • Original: ${cur.baseKey}` : ''}
              </div>
            )
          })()}
        </div>
        {/* Top-left home button */}
        <button
          className="iconbtn"
          aria-label="Go home"
          title="Home"
          onClick={() => navigate('/')}
          style={{ position:'fixed', top:10, left:10, zIndex:5, padding:'10px 12px' }}
        >
          <HomeIcon />
        </button>
        <button
          className="iconbtn"
          aria-label="Back to setlist"
          title="Back to setlist"
          onClick={() => navigate(setlistUrl)}
          style={{ position:'fixed', top:10, left:64, zIndex:5, padding:'10px 12px' }}
        >
          <ArrowLeft />
        </button>
        {/* Top-right settings (opens menu) */}
        <button
          className="iconbtn"
          aria-label="Open settings"
          title="Settings"
          onClick={() => setOpenSettings(true)}
          style={{ position:'fixed', top:10, right:10, zIndex:6, padding:'10px 12px' }}
        >
          <SlidersIcon />
        </button>
        {/* Column toggle moved into settings */}

        {/* Settings drawer */}
        {openSettings && (
          <div className="gc-drawer" data-open="true" role="dialog" aria-modal="true" aria-label="Settings">
            <div className="gc-drawer__overlay" onClick={() => setOpenSettings(false)} />
            <div className="gc-drawer__panel">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontWeight:700, fontSize:18 }}>Settings</div>
                <button className="gc-btn gc-btn--iconOnly" aria-label="Close" onClick={() => setOpenSettings(false)} title="Close"><RemoveIcon /></button>
              </div>
              <div className="gc-drawer__links" style={{ gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>Theme</div>
                  <button className="gc-btn" onClick={() => { toggleTheme(); setThemeBump(x => x + 1) }} title={currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle dark mode">
                    {currentTheme() === 'dark' ? <Sun /> : <Moon />} <span className="text-when-wide">{currentTheme() === 'dark' ? ' Light' : ' Dark'}</span>
                  </button>
                </div>
                {!isVerse && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div>Chords</div>
                    <button className="gc-btn" onClick={() => setShowChords(v => !v)} aria-label="Toggle chords">
                      <EyeIcon /> <span className="text-when-wide">{showChords ? ' On' : ' Off'}</span>
                    </button>
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>Show stopwatch</div>
                  <label style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                    <input type="checkbox" checked={showStopwatch} onChange={e => setShowStopwatch(e.target.checked)} />
                    <span>{showStopwatch ? 'On' : 'Off'}</span>
                  </label>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>Clock format</div>
                  <select value={clock24h ? '24' : '12'} onChange={e => setClock24h(e.target.value === '24')} aria-label="Clock format">
                    <option value="12">12-hour</option>
                    <option value="24">24-hour</option>
                  </select>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>Columns</div>
                  {isVerse ? (
                    <span className="meta">Locked to 1 column</span>
                  ) : (
                    <div style={{ display:'flex', gap:8 }}>
                      <button
                        className={`gc-btn ${cols === 1 ? 'gc-btn--primary' : ''}`}
                        aria-label="Use 1 column"
                        onClick={() => {
                          const target = 1
                          setAutoSize(false)
                          const viewport = viewportRef.current
                          const content = contentRef.current
                          if (!viewport || !content) { setCols(target); return }
                          const prevSize = content.style.fontSize
                          const prevCols = content.style.columnCount
                          const prevGap = content.style.columnGap
                          try {
                            let pt = fontPx || 20
                            for (;;) {
                              content.style.fontSize = `${pt}px`
                              content.style.columnCount = String(target)
                              content.style.columnGap = target === 2 ? '20px' : '0px'
                              // eslint-disable-next-line no-unused-expressions
                              content.offsetHeight
                              const headerH = headerRef.current?.offsetHeight || 0
                              const barH = barRef.current?.offsetHeight || 0
                              const avail = (viewport.clientHeight - headerH - barH)
                              if (content.scrollHeight <= avail || pt <= 12) break
                              pt -= 1
                            }
                            setCols(target)
                            setFontPx(prev => Math.max(12, Math.min(prev || pt, pt)))
                          } finally {
                            content.style.fontSize = prevSize
                            content.style.columnCount = prevCols
                            content.style.columnGap = prevGap
                          }
                        }}
                      >
                        <OneColIcon /> <span className="text-when-wide">1</span>
                      </button>
                      <button
                        className={`gc-btn ${cols === 2 ? 'gc-btn--primary' : ''}`}
                        aria-label="Use 2 columns"
                        onClick={() => {
                          const target = 2
                          setAutoSize(false)
                          const viewport = viewportRef.current
                          const content = contentRef.current
                          if (!viewport || !content) { setCols(target); return }
                          const prevSize = content.style.fontSize
                          const prevCols = content.style.columnCount
                          const prevGap = content.style.columnGap
                          try {
                            let pt = fontPx || 20
                            for (;;) {
                              content.style.fontSize = `${pt}px`
                              content.style.columnCount = String(target)
                              content.style.columnGap = target === 2 ? '20px' : '0px'
                              // eslint-disable-next-line no-unused-expressions
                              content.offsetHeight
                              const headerH = headerRef.current?.offsetHeight || 0
                              const barH = barRef.current?.offsetHeight || 0
                              const avail = (viewport.clientHeight - headerH - barH)
                              if (content.scrollHeight <= avail || pt <= 12) break
                              pt -= 1
                            }
                            setCols(target)
                            setFontPx(prev => Math.max(12, Math.min(prev || pt, pt)))
                          } finally {
                            content.style.fontSize = prevSize
                            content.style.columnCount = prevCols
                            content.style.columnGap = prevGap
                          }
                        }}
                      >
                        <TwoColIcon /> <span className="text-when-wide">2</span>
                      </button>
                    </div>
                  )}
                </div>
                {!isVerse && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div>Transpose increment</div>
                    <label style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                      <input type="checkbox" checked={halfStep} onChange={e => setHalfStep(e.target.checked)} />
                      <span>Half-step</span>
                    </label>
                  </div>
                )}
                {!isVerse && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div>Set key</div>
                    <KeySelector
                      baseKey={cur?.baseKey || 'C'}
                      valueKey={toKey}
                      disabled={!cur}
                      onChange={(full) => {
                        const off = stepsBetween(cur?.baseKey, full)
                        setSongOffsets(arr => { const c = arr.slice(); c[idx] = off; return c })
                        setTranspose(off)
                      }}
                    />
                  </div>
                )}
                {!isVerse && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div>Reset key</div>
                    <button className="gc-btn" onClick={() => { const b = (baseOffsets[idx] ?? 0); setTranspose(b); setSongOffsets(arr => { const c = arr.slice(); c[idx] = b; return c }) }} aria-label="Reset key"><RemoveIcon /> <span className="text-when-wide">Reset</span></button>
                  </div>
                )}
              </div>
              <div className="gc-drawer__footer">
                <button className="gc-btn" onClick={() => setOpenSettings(false)}>Done</button>
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        <div
          ref={contentRef}
          className="worship__content"
          style={{
            flex:'1 1 auto', minHeight:0, overflow:'auto', padding:'10px 16px 12px',
            fontSize: fontPx ? `${fontPx}px` : undefined,
            lineHeight: 1.35,
            columnCount: displayCols,
            columnGap: displayCols === 2 ? '20px' : undefined,
            maxHeight: availH ? `${availH}px` : undefined,
          }}
        >
          {cur ? (
            cur.type === 'verse' ? (
              <VerseView sections={cur.sections || []} />
            ) : (
              <div className="worship__song" style={{maxWidth:1200, margin:'0 auto'}}>
                {(cur.sections || []).map((sec, si) => (
                  <div key={si} style={{breakInside:'avoid'}}>
                    {sec.label ? <div className="section">[{sec.label}]</div> : null}
                    {(sec.lines || []).map((ln, li) => (
                      ln.instrumental ? (
                        showChords ? (
                          <InstrumentalRow
                            key={`${si}-${li}`}
                            spec={ln.instrumental}
                            steps={steps}
                            preferFlat={preferFlat}
                            split={displayCols === 2}
                          />
                        ) : null
                      ) : ln.comment ? (
                        <div key={`${si}-${li}`} className="comment">{ln.plain}</div>
                      ) : (
                        <ChordLine
                          key={`${si}-${li}`}
                          plain={ln.plain}
                          chords={ln.chords}
                          steps={steps}
                          preferFlat={preferFlat}
                          showChords={showChords}
                        />
                      )
                    ))}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>

        {/* Toolbar */}
        <div ref={barRef} className="worship__bar" role="toolbar" aria-label="Worship controls" style={{
          position:'fixed', left:0, right:0, bottom:0,
          display:'flex', gap:8, alignItems:'center', justifyContent:'space-between',
          padding:'12px 14px', background:'var(--card)', borderTop:'1px solid var(--line)'
        }}>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            {/* Key down */}
            <button
            className="gc-btn"
              style={{padding:'12px 16px', minWidth:44, minHeight:44}}
              onClick={() => shiftKey(-1)}
              title="Lower key"
              aria-label="Lower key"
              disabled={isVerse}
            >
              <ArrowDown />{!isMobile ? <span className="text-when-wide"> Key Down</span> : null}
            </button>
            {/* Key up */}
            <button
            className="gc-btn"
              style={{padding:'12px 16px', minWidth:44, minHeight:44}}
              onClick={() => shiftKey(1)}
              title="Raise key"
              aria-label="Raise key"
              disabled={isVerse}
            >
              <ArrowUp />{!isMobile ? <span className="text-when-wide"> Key Up</span> : null}
            </button>
            {/* Reset key */}
            <button
            className="gc-btn"
              style={{padding:'12px 16px', minWidth:44, minHeight:44}}
              onClick={() => { const b = (baseOffsets[idx] ?? 0); setTranspose(b); setSongOffsets(arr => { const c = arr.slice(); c[idx] = b; return c }) }}
              title="Reset key"
              aria-label="Reset key"
              disabled={isVerse}
            >
              <RemoveIcon />{!isMobile ? <span className="text-when-wide"> Reset</span> : null}
            </button>
          </div>
          {/* Center quick search (hidden on mobile) */}
          {!isMobile && (
            <div ref={searchRef} style={{position:'relative', flex:'1 1 40%', display:'flex', justifyContent:'center'}}>
              <input
                value={q}
                onChange={e=> { setQ(e.target.value); setOpenSuggest(true) }}
                onFocus={()=> setOpenSuggest(true)}
                placeholder="Add song…"
                aria-label="Add song by title"
                style={{ minWidth: 240, maxWidth: 420 }}
              />
              {openSuggest && q.trim() && titleResults.length > 0 && (
                <div
                  role="listbox"
                  style={{
                    position:'absolute', bottom:'100%', marginBottom:8,
                    background:'var(--card)', color:'var(--text)', border:'1px solid var(--line)', borderRadius:8,
                    boxShadow:'0 6px 24px rgba(0,0,0,.18)', maxHeight:240, overflow:'auto', width:'100%', zIndex:6
                  }}
                >
                  {titleResults.map(s => (
                    <div key={s.id} role="option" aria-selected="false" style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', borderBottom:'1px solid var(--line)'}}>
                      <div style={{minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{s.title}</div>
                      <button className="gc-btn" aria-label={`Add ${s.title}`} onClick={() => addSongAfterCurrent(s.id)}><PlusIcon /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            {isMobile && !isVerse && (
              <button
                className="gc-btn gc-btn--iconOnly"
                style={{minWidth:44, minHeight:44}}
                onClick={() => setShowChords(v => !v)}
                title="Toggle chords"
                aria-label="Toggle chords"
              >
                <EyeIcon />
              </button>
            )}
            <button className="gc-btn" style={{padding:'12px 16px', minWidth:44, minHeight:44}} onClick={() => { setAutoSize(false); setFontPx(px => Math.max(10, (px || 20) - 1)) }} title="Smaller font" aria-label="Smaller font">A−</button>
            <button className="gc-btn" style={{padding:'12px 16px', minWidth:44, minHeight:44}} onClick={() => { setAutoSize(false); setFontPx(px => Math.min(40, (px || 20) + 1)) }} title="Larger font" aria-label="Larger font">A+</button>
            {isMobile && (
              <>
                <button
                  className={`gc-btn gc-btn--iconOnly ${idx > 0 ? 'gc-btn--primary' : ''}`}
                  style={{minWidth:44, minHeight:44}}
                  onClick={prev}
                  title="Previous song"
                  aria-label="Previous song"
                  disabled={idx <= 0}
                >
                  <ArrowLeft />
                </button>
                <button
                  className={`gc-btn gc-btn--iconOnly ${idx < songs.length - 1 ? 'gc-btn--primary' : ''}`}
                  style={{minWidth:44, minHeight:44}}
                  onClick={next}
                  title="Next song"
                  aria-label="Next song"
                  disabled={idx >= songs.length - 1}
                >
                  <ArrowRight />
                </button>
              </>
            )}
            {!isMobile && (
              <>
                <button
                  className={`gc-btn ${idx > 0 ? 'gc-btn--primary' : ''}`}
                  style={{padding:'12px 18px', fontSize:16}}
                  onClick={prev}
                  title="Previous song"
                  disabled={idx <= 0}
                >
                  ← BACK
                </button>
                <button
                  className={`gc-btn ${idx < songs.length - 1 ? 'gc-btn--primary' : ''}`}
                  style={{padding:'12px 18px', fontSize:16}}
                  onClick={next}
                  title="Next song"
                  disabled={idx >= songs.length - 1}
                >
                  NEXT →
                </button>
              </>
            )}
          </div>
        </div>
        {isMobile && showSwipeHint && (
          <div className="worship__hint" role="status" aria-live="polite">Swipe left/right for songs • up/down for key</div>
        )}
      </div>
    </div>
  )
}

function InstrumentalRow({ spec, steps, split, preferFlat }){
  const inst = transposeInstrumental(spec, steps, preferFlat)
  const rows = formatInstrumental(inst, { split })
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 10 }}>
      {rows.map((line, idx) => (
        <div
          key={idx}
          style={{
            whiteSpace: 'pre',
            fontFamily: 'var(--gc-font-chords)',
            fontWeight: 700,
            fontSize: 'inherit',
            lineHeight: 1.35,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  )
}

function ChordLine({ plain, chords, steps, showChords, preferFlat }){
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const [state, setState] = useState({ offsets: [], padTop: 0, chordTop: 0 })
  const [measureKey, setMeasureKey] = useState(0)

  useEffect(() => {
    if (!hostRef.current) return
    if (!canvasRef.current) {
      const cv = document.createElement('canvas')
      cv.width = 1; cv.height = 1
      canvasRef.current = cv
    }
    const ctx = canvasRef.current.getContext('2d')
    const lyr = hostRef.current.querySelector('.lyrics')
    if (!ctx || !lyr) { setState({ offsets: [], padTop: 0, chordTop: 0 }); return }
    const cs = window.getComputedStyle(lyr)

    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const spaceW = ctx.measureText(' ').width || 6
    const measured = (showChords ? chords : []).map(c => {
      const left = ctx.measureText(plain.slice(0, c.index || 0)).width
      const sym = transposeSymPrefer(c.sym, steps, preferFlat)
      return { sym, x: left, w: 0 }
    })

    const chordFamilyRaw = window.getComputedStyle(hostRef.current).getPropertyValue('--gc-font-chords')
    const chordFontFamily = chordFamilyRaw?.trim() || `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize
    ctx.font = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    measured.forEach(m => { m.w = ctx.measureText(m.sym).width })
    resolveChordCollisions(measured, spaceW)
    // Special-case triple overlaps: keep center fixed, nudge outer two
    measured.sort((a,b)=> a.x - b.x)
    for (let i = 1; i < measured.length - 1; i++) {
      const L = measured[i-1], M = measured[i], R = measured[i+1]
      const gapLM = M.x - (L.x + L.w)
      const gapMR = R.x - (M.x + M.w)
      if (gapLM < spaceW && gapMR < spaceW) {
        L.x = Math.min(L.x, M.x - spaceW - L.w)
        R.x = Math.max(R.x, M.x + M.w + spaceW)
      }
    }
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8
    const gap = 4
    const padTop = Math.ceil(chordAscent + gap)
    const chordTop = 0
    const offsets = measured.map(m => ({ left: Math.max(0, m.x), sym: m.sym }))
    setState({ offsets, padTop, chordTop })
  }, [plain, chords, steps, showChords, measureKey])

  

  useEffect(() => {
    const el = hostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setMeasureKey(k => k + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    function onResize(){ setMeasureKey(k => k + 1) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div ref={hostRef} style={{position:'relative', marginBottom:10, paddingTop: (showChords && state.offsets.length>0) ? state.padTop : 0}}>
      {showChords && state.offsets.length>0 && (
        <div aria-hidden className="chord-layer" style={{position:'absolute', left:0, right:0, top: state.chordTop}}>
          {state.offsets.map((c, i)=>(
            <span key={i} style={{ position:'absolute', left: `${c.left}px`, fontFamily: 'var(--gc-font-chords)', fontWeight: 700 }}>
              {c.sym}
            </span>
          ))}
        </div>
      )}
      <div className="lyrics" style={{whiteSpace:'pre-wrap', overflowWrap:'anywhere', fontSize:'inherit'}}>{plain}</div>
    </div>
  )
}

function VerseView({ sections }){
  const lines = (sections || []).flatMap((sec) => sec.lines || [])
  if (!lines.length) return null
  return (
    <div style={{maxWidth:900, margin:'0 auto', display:'grid', gap:10}}>
      {lines.map((ln, idx) => {
        const label = ln.showChapter ? `${ln.chapter}:${ln.number}` : `${ln.number}`
        return (
          <div key={idx} style={{display:'flex', gap:10, alignItems:'flex-start'}}>
            <span style={{minWidth: ln.showChapter ? 46 : 28, opacity:.6, fontWeight:600}}>{label}</span>
            <span style={{flex:1, whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{ln.text}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Title strip for Worship Mode ---------- */
function TitleStrip({ title, clockText, stopwatchText, showStopwatch, sizeCss, isRunning, onToggleRun, onReset, canReset }){
  const hostRef = useRef(null)
  const leftRef = useRef(null)
  const midWrapRef = useRef(null)
  const midRef = useRef(null)
  const rightRef = useRef(null)
  const originalTitle = String(title || '')
  const [display, setDisplay] = useState({ text: originalTitle, size: 0 })
  const [ready, setReady] = useState(false)
  const [measureKey, setMeasureKey] = useState(0)

  useLayoutEffect(() => {
    const host = hostRef.current
    const left = leftRef.current
    const midWrap = midWrapRef.current
    const mid = midRef.current
    const right = rightRef.current
    if (!host || !mid) return
    mid.style.whiteSpace = 'nowrap'
    mid.textContent = originalTitle
    mid.style.fontSize = ''

    const hostRect = host.getBoundingClientRect()
    const hostW = Math.max(0, hostRect.width)
    const leftRect = left ? left.getBoundingClientRect() : null
    const rightRect = (showStopwatch && right) ? right.getBoundingClientRect() : null
    const gap = 12
    const leftEdge = leftRect ? (leftRect.right - hostRect.left) : 0
    const rightEdge = rightRect ? (rightRect.left - hostRect.left) : hostW
    const avail = Math.max(0, rightEdge - leftEdge - gap * 2)
    // Constrain the visible mid wrapper and add interior padding to avoid overlap
    if (midWrap){
      midWrap.style.maxWidth = `${avail}px`
      midWrap.style.width = `${avail}px`
      midWrap.style.overflow = 'hidden'
    }
    host.style.paddingLeft = `${Math.max(0, leftEdge + gap)}px`
    host.style.paddingRight = `${Math.max(0, (hostW - rightEdge) + gap)}px`

    const cs = window.getComputedStyle(mid)
    const basePx = parseFloat(cs.fontSize) || 20
    const minPx = Math.max(10, Math.floor(basePx - 6))
    const measure = () => mid.getBoundingClientRect().width

    let fontPx = basePx
    let currentW = measure()
    // Stepwise shrink for stability
    while (currentW > avail && fontPx > minPx) {
      fontPx = Math.max(minPx, fontPx - 1)
      mid.style.fontSize = `${fontPx}px`
      currentW = measure()
    }
    if (currentW > avail) {
      const words = originalTitle.split(/\s+/).filter(Boolean)
      if (!words.length) {
        mid.textContent = '…'
      } else {
        let n = words.length
        while (n > 1) {
          const candidate = words.slice(0, n - 1).join(' ') + '…'
          mid.textContent = candidate
          if (measure() <= avail) break
          n -= 1
        }
        if (n <= 1) {
          const single = words[0]
          mid.textContent = (single && single.length <= 3) ? single : '…'
        }
      }
    }
    setDisplay({ text: mid.textContent || originalTitle, size: fontPx })
    setReady(true)
  }, [originalTitle, clockText, stopwatchText, showStopwatch, isRunning, canReset, measureKey])

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { setReady(false); setMeasureKey(k => k + 1) })
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    function onResize(){ setMeasureKey(k => k + 1) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isDark = (currentTheme && typeof currentTheme === 'function') ? (currentTheme() === 'dark') : false
  const playStyle = isRunning
    ? (isDark ? { background:'#7f1d1d', color:'#fecaca', borderColor:'#7f1d1d', padding:'4px' } : { background:'#fee2e2', color:'#991b1b', borderColor:'#fecaca', padding:'4px' })
    : (isDark ? { background:'#064e3b', color:'#a7f3d0', borderColor:'#065f46', padding:'4px' } : { background:'#dcfce7', color:'#065f46', borderColor:'#bbf7d0', padding:'4px' })
  const resetStyle = isDark
    ? { background:'#374151', color:'#e5e7eb', borderColor:'#4b5563', opacity: canReset ? 1 : .6, padding:'4px' }
    : { background:'#e5e7eb', color:'#111827', borderColor:'#e5e7eb', opacity: canReset ? 1 : .6, padding:'4px' }

  return (
    <div className="songtitlebar" ref={hostRef} aria-label="Song header" style={{ fontSize: sizeCss, ['--side-offset']: '80px' }}>
      {/* Left: Clock (align near Home button) */}
      <span ref={leftRef} className="songtitlebar__side songtitlebar__side--left" aria-label="Clock" title="Clock">
        {clockText}
      </span>
      {/* Middle: Smart-fitting title */}
      <div className="songtitlebar__mid" ref={midWrapRef}>
        <span ref={midRef} className="songtitlebar__title" style={display.size ? { fontSize: `${display.size}px` } : undefined} title={originalTitle}>
          {ready ? display.text : originalTitle}
        </span>
      </div>
      {/* Right: Stopwatch (align near Settings button) */}
      {showStopwatch && (
        <span ref={rightRef} className="songtitlebar__side songtitlebar__side--right" aria-label="Stopwatch" title="Stopwatch">
          <span>{stopwatchText || '00:00'}</span>
          <button
            className="gc-btn gc-btn--iconOnly gc-btn--sm"
            onClick={onToggleRun}
            aria-label={isRunning ? 'Stop stopwatch' : 'Start stopwatch'}
            title={isRunning ? 'Stop' : 'Start'}
            style={playStyle}
          >
            {isRunning ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <button
            className="gc-btn gc-btn--iconOnly gc-btn--sm"
            onClick={onReset}
            aria-label="Reset stopwatch"
            title="Reset"
            disabled={!canReset}
            style={resetStyle}
          >
            <ResetIcon size={14} />
          </button>
        </span>
      )}
    </div>
  )
}
