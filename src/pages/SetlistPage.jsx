import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import Fuse from 'fuse.js'
import indexData from '../data/index.json'
import { KEYS } from '../utils/chordpro'
import { ArrowUp, ArrowDown, MinusIcon, DownloadIcon, PlusIcon, SaveIcon, TrashIcon, MediaIcon, LinkIcon, CloudDownloadIcon } from '../components/Icons'
import { stepsBetween, transposeSymPrefer } from '../utils/chordpro'
import { transposeInstrumental } from '../utils/songs/instrumental'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { normalizeSongInput } from '../utils/pdf/pdfLayout'
import { listSets, getSet, saveSet, deleteSet } from '../utils/setlists/sets'
import { fetchTextCached } from '../utils/network/fetchCache'
import { showToast } from '../utils/app/toast'
import { headOk } from '../utils/network/headCache'
import { encodeSet, decodeSet } from '../utils/setlists/setcode'
import { downloadSetlistAsPptx } from '../utils/export/downloadSetlist'
import { publicUrl } from '../utils/network/publicUrl'
import { isIncompleteSong } from '../utils/songs/songStatus'
import { parseVerseReference, suggestBookName, isVerseId, parseVerseId } from '../utils/songs/verseRef'
import { fetchBibleChapter } from '../utils/bible/chapters'
import {
  getFallbackBibleTranslations,
  listBibleTranslations,
  readBibleTranslationPreference,
  resolveBibleTranslationSelection,
  resolveBibleTranslationLabel,
  writeBibleTranslationPreference,
} from '../utils/bible/translations'
import { buildBibleTranslationGroups, translationOptionLabel } from '../utils/bible/translationMenu'
import Busy from '../components/Busy'
import { SongCard } from '../components/ui/Card'
import Button from '../components/ui/Button'
import KeySelector from '../components/KeySelector'
import Input from '../components/ui/Input'
import Toolbar from '../components/ui/Toolbar'
import PageContainer from '../components/layout/PageContainer'
import { filterByTag, pickManyRandom, pickRandom } from '../utils/songs/quickActions'
import { Chip } from '../components/ui/layout-kit'
import {
  buildSongCatalog,
  getLanguageChipLabel,
  hasGroupLanguage,
  resolveGroupEntry,
  resolveInitialSongLanguage,
  writeSongLanguagePreference,
} from '../utils/songs/songCatalog'

// Lazy pdf exporter
let pdfLibPromise
const loadPdfLib = () => pdfLibPromise || (pdfLibPromise = import('../utils/pdf'))

function makeUid(){
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {}
  return `sel-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function createSelection(input){
  if (!input) return null
  const { id, toKey = '' } = input
  if (id == null) return null
  return { uid: makeUid(), id, toKey }
}

function hydrateSelections(entries = []){
  return entries.map(entry => createSelection(entry)).filter(Boolean)
}

function safeDecodeURIComponent(value){
  try { return decodeURIComponent(value) } catch { return value }
}

function splitVerseInput(input){
  const raw = String(input || '')
  if (!raw.trim()) return { bookPart: '', refPart: '' }
  const colonIndex = raw.indexOf(':')
  if (colonIndex > -1) {
    let i = colonIndex - 1
    while (i >= 0 && /\d/.test(raw[i])) i -= 1
    const digitStart = i + 1
    if (digitStart < colonIndex) {
      return {
        bookPart: raw.slice(0, digitStart).trim(),
        refPart: raw.slice(digitStart).trim(),
      }
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

function buildVerseCompletion(input, suggestion){
  if (!suggestion) return null
  const raw = String(input || '')
  if (!raw.trim()) return null
  const { bookPart, refPart } = splitVerseInput(raw)
  if (!bookPart) return null
  const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const composed = refPart ? `${suggestion} ${refPart}` : `${suggestion} `
  if (!normalize(composed).startsWith(normalize(raw))) return null
  if (composed.length <= raw.length) return null
  return { composed, prefix: raw, remainder: composed.slice(raw.length) }
}

export default function Setlist(){
  const { code: routeCode, songIds: routeSongIds } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const catalog = useMemo(() => buildSongCatalog(indexData?.items || []), [])
  const allSongsById = catalog.byId
  const languageChipCodes = catalog.translationLanguages || []
  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    resolveInitialSongLanguage(languageChipCodes.length ? languageChipCodes : catalog.allLanguages)
  )
  // existing state
  const [name, setName] = useState('New Setlist')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [icpOnly, setIcpOnly] = useState(() => {
    try { return localStorage.getItem('pref:icpOnly') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('pref:icpOnly', icpOnly ? '1' : '0') } catch {}
  }, [icpOnly])
  const [list, setList] = useState([])
  const [pptxMap, setPptxMap] = useState({})
  const [pptxProgress, setPptxProgress] = useState('')
  const [combinePptxProgress, setCombinePptxProgress] = useState('')
  const pptxCount = Object.keys(pptxMap).length
  const [busy, setBusy] = useState(false)
  const [isMobile, setIsMobile] = useState(() => { try { return window.innerWidth <= 640 } catch { return false } })
  const [isTablet, setIsTablet] = useState(() => { try { return window.innerWidth <= 820 } catch { return false } })
  const [isStacked, setIsStacked] = useState(() => { try { return window.innerWidth <= 900 } catch { return false } })
  const originalHtmlOverflow = useRef('')
  const originalBodyOverflow = useRef('')
  const quickAppliedRef = useRef(false)

  // named sets
  const [currentId, setCurrentId] = useState(null)
  const [savedSets, setSavedSets] = useState(() => listSets())
  const [selectedId, setSelectedId] = useState('')
  const [loadOpen, setLoadOpen] = useState(false)
  const [loadChoice, setLoadChoice] = useState('')
  const [verseOpen, setVerseOpen] = useState(false)
  const [verseInput, setVerseInput] = useState('')
  const [verseError, setVerseError] = useState('')
  const [verseSuggest, setVerseSuggest] = useState('')
  const [bibleTranslations, setBibleTranslations] = useState(() => getFallbackBibleTranslations())
  const [verseTranslation, setVerseTranslation] = useState(() => readBibleTranslationPreference())
  const verseCacheRef = useRef(new Map())
  const translationGroups = useMemo(
    () => buildBibleTranslationGroups(bibleTranslations),
    [bibleTranslations]
  )

  useEffect(() => {
    writeSongLanguagePreference(selectedLanguage)
  }, [selectedLanguage])

  useEffect(() => {
    let cancelled = false
    async function loadTranslations(){
      const result = await listBibleTranslations()
      if (cancelled) return
      setBibleTranslations(result.translations)
      setVerseTranslation((current) => (
        resolveBibleTranslationSelection(current, result.translations, result.defaultTranslationId)
      ))
    }
    loadTranslations()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!verseTranslation) return
    writeBibleTranslationPreference(verseTranslation)
  }, [verseTranslation])

  // load catalog entries by selected song language
  useEffect(()=>{
    const out = []
    for (const group of catalog.groups || []) {
      let display = resolveGroupEntry(group, selectedLanguage)
      if (!display) continue
      if (isIncompleteSong(display)) {
        const fallback = group.variants.find((v) => !isIncompleteSong(v))
        if (!fallback) continue
        display = fallback
      }
      out.push({
        ...display,
        hasSelectedLanguage: hasGroupLanguage(group, selectedLanguage),
        searchTitles: group.variants.map((v) => v.title || '').filter(Boolean),
        searchTags: Array.from(new Set(group.variants.flatMap((v) => v.tags || []))),
        searchAuthors: Array.from(new Set(group.variants.flatMap((v) => v.authors || []))),
      })
    }
    setItems(out)
  }, [catalog.groups, selectedLanguage])

  function getSongById(songId){
    if (!songId) return null
    return allSongsById.get(String(songId)) || null
  }

  // check available PPTX files for current set
  useEffect(() => {
    let cancelled = false
    async function check(){
      const found = {}
      for(const sel of list){
        const s = getSongById(sel.id)
        if(!s) continue
        const slug = s.filename.replace(/\.chordpro$/i, '')
        const url = publicUrl(`pptx/${slug}.pptx`)
        const ok = await headOk(url, slug)
        if(ok) found[slug] = true
      }
      if(!cancelled) setPptxMap(found)
    }
    check()
    return () => { cancelled = true }
  }, [list, allSongsById])

  useEffect(() => {
    try {
      const html = document.documentElement
      const body = document.body
      originalHtmlOverflow.current = html.style.overflowY || ''
      originalBodyOverflow.current = body.style.overflowY || ''
      if (getComputedStyle(html).overflowY === 'hidden') html.style.overflowY = ''
      if (getComputedStyle(body).overflowY === 'hidden') body.style.overflowY = ''
    } catch {}
    return () => {
      try {
        document.documentElement.style.overflowY = originalHtmlOverflow.current
        document.body.style.overflowY = originalBodyOverflow.current
      } catch {}
    }
  }, [])

  // Load set from route code if present
  useEffect(() => {
    if (!routeCode) return
    const { entries, error } = decodeSet(routeCode)
    if (error) {
      alert(error)
      navigate('/setlist', { replace: true })
      return
    }
    // Update list and canonicalize to param-style URL
    const decoded = entries.map(e => ({ id: e.id, toKey: e.toKey }))
    setList(hydrateSelections(decoded))
    const ids = decoded.map(e => encodeURIComponent(e.id)).join(',')
    const keys = decoded.map(e => encodeURIComponent(e.toKey || '')).join(',')
    navigate(`/setlist/${ids}?toKeys=${keys}`, { replace: true })
  }, [routeCode])

  // Load set from param-style route (/setlist/:songIds?toKeys=...)
  useEffect(() => {
    if (!routeSongIds) return
    const ids = (routeSongIds || '')
      .split(',')
      .map(s => safeDecodeURIComponent(s.trim()))
      .filter(Boolean)
    if (!ids.length) return
    const qs = new URLSearchParams(location.search || '')
    const toKeys = (qs.get('toKeys') || '').split(',').map(s => safeDecodeURIComponent(s))
    const out = ids.map((id, i) => ({ id, toKey: toKeys[i] || '' }))
    setList(hydrateSelections(out))
  }, [routeSongIds, location.search])

  // Keep URL in sync with current list so refresh/share reflect state (param-style)
  useEffect(() => {
    try {
      if (!Array.isArray(list)) return
      if (list.length === 0) {
        if (routeCode || routeSongIds) navigate('/setlist', { replace: true })
        return
      }
      const ids = list.map(e => encodeURIComponent(e.id)).join(',')
      const keys = list.map(e => encodeURIComponent(e.toKey || '')).join(',')
      const currentIds = routeSongIds || ''
      const currentKeys = new URLSearchParams(location.search || '').get('toKeys') || ''
      if (ids !== currentIds || keys !== currentKeys) navigate(`/setlist/${ids}?toKeys=${keys}`, { replace: true })
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map(s => `${s.id}:${s.toKey}`).join('|'), routeSongIds, location.search, routeCode])

  // (optional) migrate legacy single-set storage if present and nothing saved yet
  useEffect(() => {
    try {
      const legacy = localStorage.getItem('setlist')
      if (!legacy) return
      if (listSets().length > 0) return
      const s = JSON.parse(legacy)
      if ((s?.name || '') || (s?.list?.length || 0) > 0) {
        const saved = saveSet({ name: s.name || 'Imported Set', items: s.list || [] })
        setSavedSets(listSets())
        setCurrentId(saved.id)
        setName(saved.name)
        setList(hydrateSelections(saved.items || []))
        setSelectedId(saved.id)
      }
    } catch {}
  }, [])

  // viewport listeners
  useEffect(() => {
    function onResize(){
      try {
        const w = window.innerWidth
        setIsMobile(w <= 640)
        setIsTablet(w <= 820)
        setIsStacked(w <= 900)
      } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    if (params.get('icp') === '1') setIcpOnly(true)
  }, [location.search])

  useEffect(() => {
    if (quickAppliedRef.current) return
    const quick = location.state?.quickAction
    if (!quick) return
    if (!items.length) return
    applyQuickAction(quick, items)
    quickAppliedRef.current = true
    navigate(location.pathname + (location.search || ''), { replace: true, state: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, items.map(s => s.id).join('|')])

  // search
  const fuse = useMemo(() => new Fuse(items, {
    keys: ['title', 'tags', 'searchTitles', 'searchTags', 'searchAuthors'],
    threshold: 0.4
  }), [items])
  function icpPass(s){ return !icpOnly || (Array.isArray(s.tags) ? s.tags.includes('ICP') : s.tags === 'ICP') }
  const results = useMemo(() => {
    const base = q ? fuse.search(q).map((r) => r.item) : items.slice()
    const filtered = base.filter(icpPass)
    filtered.sort((a, b) => {
      if (a.hasSelectedLanguage !== b.hasSelectedLanguage) {
        return a.hasSelectedLanguage ? -1 : 1
      }
      return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' })
    })
    return filtered
  }, [q, fuse, items, icpOnly])

  // list mutators
  function addSong(s){
    if (!s) return
    const entry = createSelection({ id: s.id, toKey: s.originalKey || s.key || 'C' })
    setList(prev => [...prev, entry])
  }
  async function addVerseFromInput(input){
    const parsed = parseVerseReference(input, { translation: verseTranslation })
    if (parsed.error) {
      setVerseError('Please check verse reference.')
      return false
    }
    const validation = await validateVerseReference(parsed)
    if (!validation.ok) {
      setVerseError(validation.message)
      return false
    }
    const entry = createSelection({ id: parsed.id, toKey: '' })
    if (!entry) return false
    setList(prev => [...prev, entry])
    setVerseInput('')
    setVerseError('')
    setVerseOpen(false)
    return true
  }
  function removeSong(uid){
    setList(prev => prev.filter(x => x.uid !== uid))
  }
  function move(uid, dir){
    setList(prev => {
      const i = prev.findIndex(x => x.uid === uid)
      if (i < 0) return prev
      const j = i + (dir === 'up' ? -1 : 1)
      if (j < 0 || j >= prev.length) return prev
      const copy = prev.slice()
      const [item] = copy.splice(i, 1)
      copy.splice(j, 0, item)
      return copy
    })
  }
  function moveToIndex(srcUid, dstIndex){
    setList(prev => {
      if (dstIndex < 0 || dstIndex >= prev.length) return prev
      const i = prev.findIndex(x => x.uid === srcUid)
      if (i < 0 || i === dstIndex) return prev
      const copy = prev.slice()
      const [item] = copy.splice(i, 1)
      copy.splice(dstIndex, 0, item)
      return copy
    })
  }

  function applyQuickAction(key, songs){
    if (!key) return
    function addList(entries){
      if (!entries || !entries.length) return
      setList(hydrateSelections(entries.map(e => ({ id: e.id, toKey: e.toKey }))))
    }

    function songToEntry(song){
      if (!song) return null
      return { id: song.id, toKey: song.originalKey || song.key || 'C' }
    }

    function uniquePool(pool, usedIds){
      return pool.filter((s) => s && !usedIds.has(s.id))
    }

    function chooseRandom(pool, usedIds){
      const filtered = uniquePool(pool, usedIds)
      const pick = filtered.length ? pickRandom(filtered) : null
      if (pick) usedIds.add(pick.id)
      return pick
    }

    function buildCelebrationSet(){
      const fast = filterByTag(songs, 'FAST')
      const out = []
      const used = new Set()
      const primary = fast.length >= 4 ? pickManyRandom(fast, 4) : fast.slice()
      primary.forEach((s) => { if (s) used.add(s.id); out.push(s) })
      if (out.length < 4){
        const filler = pickManyRandom(uniquePool(songs, used), Math.min(4 - out.length, Math.max(0, songs.length - out.length)))
        out.push(...filler)
      }
      return out.filter(Boolean).map(songToEntry).filter(Boolean).slice(0, 4)
    }

    function buildThreeSongFlow(){
      const used = new Set()
      const slow = filterByTag(songs, 'SLOW')
      const slowKey = (key) => slow.filter((s) => (s?.originalKey || '').toUpperCase() === key.toUpperCase())
      const fast = filterByTag(songs, 'FAST')

      const first = chooseRandom(slowKey('G'), used) || chooseRandom(slow, used) || chooseRandom(songs, used)
      const second = chooseRandom(fast, used) || chooseRandom(songs, used)
      const third = chooseRandom(slowKey('A'), used) || chooseRandom(slow, used) || chooseRandom(songs, used)

      return [first, second, third].filter(Boolean).map(songToEntry).filter(Boolean)
    }

    function buildRandomThemeSet(){
      const themes = ['CROSS', 'COMMITMENT', 'MISSION', 'MISSIONS', 'PRAISE', 'HYMN']
      const theme = pickRandom(themes)
      const matches = filterByTag(songs, theme)
      const used = new Set()
      const out = []
      if (matches.length >= 4){
        out.push(...pickManyRandom(matches, 4))
      } else if (matches.length >= 2){
        out.push(...pickManyRandom(matches, Math.min(4, matches.length)))
      } else if (matches.length){
        out.push(...matches)
      }
      out.forEach((s) => s && used.add(s.id))
      const need = Math.max(0, 2 - out.length)
      if (need > 0){
        const filler = pickManyRandom(uniquePool(songs, used), Math.min(need, songs.length - out.length))
        out.push(...filler)
      }
      if (out.length < 4){
        const more = pickManyRandom(uniquePool(songs, used), Math.min(4 - out.length, songs.length - out.length))
        out.push(...more)
      }
      return out.filter(Boolean).map(songToEntry).filter(Boolean).slice(0, 4)
    }

    let entries = []
    if (key === 'celebrationSet') entries = buildCelebrationSet()
    else if (key === 'threeSongFlow') entries = buildThreeSongFlow()
    else if (key === 'randomThemeSet') entries = buildRandomThemeSet()

    if (entries.length) addList(entries)
  }
  function changeKey(uid, val){
    setList(prev => prev.map(x => x.uid === uid ? { ...x, toKey: val } : x))
  }

  // quick transpose (entire set)
  function transposeSet(delta){
    setList(prev => prev.map(sel => {
      const s = getSongById(sel.id)
      const from = sel.toKey || s?.originalKey || 'C'
      const preferFlat = /b/.test(String(s?.originalKey || ''))
      return { ...sel, toKey: transposeSymPrefer(from, delta, preferFlat) }
    }))
  }
  function resetSetKeys(){
    setList(prev => prev.map(sel => {
      const s = getSongById(sel.id)
      return { ...sel, toKey: s?.originalKey || 'C' }
    }))
  }

  // named set helpers
  function refreshSaved(idToSelect){
    setSavedSets(listSets())
    setSelectedId(idToSelect || '')
  }
  function onNew(){
    setCurrentId(null); setName('New Setlist'); setList([]); setSelectedId('')
  }
  function onSave(){
    const proposed = (name?.trim() || 'New Setlist')
    const input = window.prompt('Save set as:', proposed)
    if (input === null) return
    const finalName = (String(input).trim() || 'New Setlist')
    // If no current id, but a set exists with this name, overwrite it by reusing its id
    let targetId = currentId
    if (!targetId) {
      const existing = (listSets() || []).find(s => (s.name || '') === finalName)
      if (existing) targetId = existing.id
    }
    const payload = list.map(({ id, toKey }) => ({ id, toKey }))
    const saved = saveSet({ id: targetId, name: finalName, items: payload })
    setName(saved.name); setCurrentId(saved.id); refreshSaved(saved.id)
  }
  function onLoadConfirm(){
    const id = loadChoice || selectedId || ''
    if (!id) { setLoadOpen(false); return }
    const s = getSet(id)
    if (s){ setCurrentId(s.id); setName(s.name || 'New Setlist'); setList(hydrateSelections(s.items || [])) ; setSelectedId(s.id) }
    setLoadOpen(false)
  }
  function onOpenLoad(){
    const first = (savedSets[0]?.id) || ''
    setLoadChoice(selectedId || first)
    setLoadOpen(true)
  }
  // Duplicate removed per request
  function onDelete(){
    if (!currentId) return
    if (window.confirm(`Delete set "${name}"? This cannot be undone.`)){
      deleteSet(currentId); onNew(); refreshSaved('')
    }
  }

  // export & print
async function exportPdf() {
  setBusy(true);
  try {
    const { downloadMultiSongPdf } = await loadPdfLib();
    const songs = [];
    const chapterCache = verseCacheRef.current;

    async function loadChapter(translationId, book, chapter){
      const key = `${translationId}::${book}::${chapter}`
      if (chapterCache.has(key)) return chapterCache.get(key)
      try {
        const json = await fetchBibleChapter({ translationId, book, chapter })
        chapterCache.set(key, json)
        return json
      } catch {
        chapterCache.set(key, null)
        return null
      }
    }

    function listVerseNumbers(chapterData){
      return Object.keys(chapterData?.verses || {})
        .map((n) => Number(n))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b)
    }

    for (const sel of list) {
      if (isVerseId(sel.id)) {
        const parsed = parseVerseId(sel.id)
        if (!parsed) {
          showToast('Please check verse reference.')
          continue
        }
        try {
          const segments = parsed.segments || []
          const multiChapter = segments.length > 1
          const lines = []
          const seen = new Set()

          for (const segment of segments) {
            const chapterData = await loadChapter(parsed.translation, String(parsed.bookNumber), segment.chapter)
            if (!chapterData?.verses) continue
            const verseMap = chapterData.verses || {}
            const allNums = listVerseNumbers(chapterData)
            const max = allNums.length ? allNums[allNums.length - 1] : 0
            if (!segment.ranges) {
              for (const num of allNums) {
                const key = `${segment.chapter}:${num}`
                if (seen.has(key)) continue
                const text = verseMap[String(num)]
                if (!text) continue
                const label = multiChapter ? `${segment.chapter}:${num}` : `${num}`
                lines.push({ plain: `${label} ${text}` })
                seen.add(key)
              }
              continue
            }
            for (const range of segment.ranges) {
              const start = range.start
              const end = range.end == null ? max : range.end
              for (let v = start; v <= end; v += 1) {
                const key = `${segment.chapter}:${v}`
                if (seen.has(key)) continue
                const text = verseMap[String(v)]
                if (!text) continue
                const label = multiChapter ? `${segment.chapter}:${v}` : `${v}`
                lines.push({ plain: `${label} ${text}` })
                seen.add(key)
              }
            }
          }

          if (!lines.length) {
            showToast(`No verses found for ${parsed.refDisplay}`)
            continue
          }

          songs.push({
            title: parsed.refDisplay || parsed.id,
            key: '',
            pdfColumns: 1,
            sections: [{ label: '', lines }],
          })
        } catch (err) {
          console.error(err)
          showToast(`Failed to load ${parsed.refDisplay}`)
        }
        continue
      }
      const s = getSongById(sel.id)
      if (!s) continue;

      try {
        const url = publicUrl(`songs/${s.filename}`)
        const txt = await fetchTextCached(url);
        const doc = parseChordProOrLegacy(txt);

        const baseKey =
          doc.meta?.key ||
          doc.meta?.originalkey ||
          s.originalKey ||
          "C";

        const steps = stepsBetween(baseKey, sel.toKey || baseKey);
        const baseRootRaw = (String(baseKey).match(/^([A-G][#b]?)/) || [,''])[1]
        const preferFlat = !!(baseRootRaw && /b$/.test(baseRootRaw))

        const blocks = (doc.sections || []).map((sec) => ({
          section: sec.label,
          lines: (sec.lines || []).map((ln) => {
            if (ln.instrumental) {
              return { instrumental: transposeInstrumental(ln.instrumental, steps, preferFlat) };
            }
            if (ln.comment) {
              return {
                plain: ln.comment,
                chordPositions: [],
                comment: ln.comment,
              };
            }
            return {
              plain: ln.lyrics || '',
              chordPositions: (ln.chords || []).map((c) => ({
                sym: transposeSymPrefer(c.sym, steps, preferFlat),
                index: c.index,
              })),
            };
          }),
        }));

        const slug = s.filename.replace(/\.chordpro$/i, "");
        const song = normalizeSongInput({
          title: doc.meta?.title || s.title || slug,
          key: sel.toKey || baseKey,
          capo: doc.meta?.capo,
          lyricsBlocks: blocks,
        });
        songs.push(song);
      } catch (err) {
        console.error(err);
        showToast(`Failed to process ${s.filename}`);
      }
    }

    if (songs.length) {
      await downloadMultiSongPdf(songs);
    }
  } finally {
    setBusy(false);
  }
}

  function prefetchPdf(){ loadPdfLib() }

  // Copy set link (generates code on demand)
  async function copySetLink(){
    try {
      const ids = list.map(e => encodeURIComponent(e.id)).join(',')
      const keys = list.map(e => encodeURIComponent(e.toKey || '')).join(',')
      const baseOrigin = (() => {
        try {
          if (typeof window !== 'undefined' && window.location) {
            const origin = window.location.origin || ''
            return `${origin}/`
          }
        } catch {}
        return ''
      })()
      const url = `${baseOrigin}setlist/${ids}?toKeys=${keys}`
      await navigator.clipboard.writeText(url)
      try { showToast?.('Link copied!') } catch {}
    } catch (e) { alert('Failed to copy link') }
  }

  useEffect(() => {
    if (!verseOpen) return
    const rawBook = splitVerseInput(verseInput).bookPart
    const suggestion = suggestBookName(rawBook)
    setVerseSuggest(suggestion || '')
  }, [verseInput, verseOpen])

  async function validateVerseReference(parsed){
    if (!parsed?.book || !parsed?.segments?.length) return { ok: false, message: 'Please check verse reference.' }

    async function loadChapter(translationId, book, chapter){
      const key = `${translationId}::${book}::${chapter}`
      const cache = verseCacheRef.current
      if (cache.has(key)) return cache.get(key)
      try {
        const json = await fetchBibleChapter({ translationId, book, chapter })
        cache.set(key, json)
        return json
      } catch {
        cache.set(key, null)
        return null
      }
    }

    let foundAny = false
    for (const segment of parsed.segments) {
      const chapterData = await loadChapter(parsed.translation, String(parsed.bookNumber), segment.chapter)
      if (!chapterData?.verses) return { ok: false, message: 'No verse found.' }
      const verseMap = chapterData.verses || {}
      const verseKeys = Object.keys(verseMap)
      if (!segment.ranges) {
        if (verseKeys.length) foundAny = true
        continue
      }
      for (const range of segment.ranges) {
        const start = range.start
        const end = range.end ?? start
        if (!verseMap[String(start)] || !verseMap[String(end)]) {
          return { ok: false, message: 'Please check verse reference.' }
        }
        foundAny = true
      }
    }
    if (!foundAny) return { ok: false, message: 'No verse found.' }
    return { ok: true }
  }

  function applyVerseSuggestion(){
    const completion = buildVerseCompletion(verseInput, verseSuggest)
    if (!completion) return
    setVerseInput(completion.composed)
  }

  async function bundlePptx(){
    if (combinePptxProgress) return
    setPptxProgress(`Bundling 0/${list.length}…`)
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    let added = 0
    for(let i=0; i<list.length; i++){
      const sel = list[i]
      const s = getSongById(sel.id)
      if(!s){ setPptxProgress(`Bundling ${i+1}/${list.length}…`); continue }
      setPptxProgress(`Bundling ${i+1}/${list.length}…`)
      const slug = s.filename.replace(/\.chordpro$/i, '')
      if(!pptxMap[slug]) continue
      try{
        const res = await fetch(publicUrl(`pptx/${slug}.pptx`))
        if(!res.ok) continue
        const blob = await res.blob()
        added++
        zip.file(`${String(added).padStart(2,'0')}-${slug}.pptx`, blob)
      }catch{}
    }
    if(added>0){
      const blob = await zip.generateAsync({ type:'blob' })
      const date = new Date().toISOString().slice(0,10).replace(/-/g,'')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `setlist-pptx-${date}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } else {
      try { (showToast && showToast('No PPTX files found for selected songs')) || alert('No PPTX files found for selected songs') } catch {}
    }
    setPptxProgress('')
  }

  async function combineSetlistPptx(){
    if (pptxProgress || combinePptxProgress) return
    setCombinePptxProgress('Combining…')
    try {
      const songs = []
      const missing = []
      for (const sel of list) {
        const s = getSongById(sel.id)
        if (!s) continue
        const slug = s.filename.replace(/\.chordpro$/i, '')
        if (!pptxMap[slug]) {
          missing.push(s.title || slug)
          continue
        }
        songs.push(s)
      }
      if (!songs.length) {
        try { (showToast && showToast('No PPTX files found for selected songs')) || alert('No PPTX files found for selected songs') } catch {}
        return
      }
      if (missing.length) {
        const msg =
          missing.length === 1
            ? `${missing[0]} PPT file unavailable`
            : `${missing.length} songs missing PPT files`
        try { showToast?.(msg) } catch {}
      }
      await downloadSetlistAsPptx(
        { name: name || 'Setlist', songs },
        {}
      )
    } catch (err) {
      console.error(err)
      try { (showToast && showToast('Failed to combine PPTX files')) || alert('Failed to combine PPTX files') } catch {}
    } finally {
      setCombinePptxProgress('')
    }
  }
  

  return (
    <PageContainer className="is-setlist">
      {/* Load Set modal */}
      {loadOpen ? (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.45)', zIndex: 90 }} role="dialog" aria-modal="true">
          <div style={{ background:'var(--card)', color:'var(--text)', border:'1px solid var(--line)', borderRadius:10, padding:16, width:'min(560px, 92vw)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Load Set</h3>
            {savedSets.length ? (
              <label style={{ display:'block', margin:'8px 0' }}>Select a saved set
                <select value={loadChoice} onChange={e=> setLoadChoice(e.target.value)} style={{ width:'100%' }}>
                  {savedSets.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {new Date(s.updatedAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="meta">No saved sets yet.</div>
            )}
            <div className="row" style={{ justifyContent:'flex-end', gap:8, marginTop: 12 }}>
              <Button onClick={()=> setLoadOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={onLoadConfirm} disabled={!savedSets.length}>Load</Button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Add Verse modal */}
      {verseOpen ? (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.45)', zIndex: 90 }} role="dialog" aria-modal="true">
          <div style={{ background:'var(--card)', color:'var(--text)', border:'1px solid var(--line)', borderRadius:10, padding:16, width:'min(560px, 92vw)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Add Verse</h3>
            <div className="gc-field" style={{ margin:'8px 0' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr minmax(220px, 34%)', gap:8, alignItems:'center' }}>
                <label className="gc-label" htmlFor="verse-input">Bible verse</label>
                <label className="gc-label" htmlFor="verse-translation">Translation</label>
                <div style={{ position:'relative' }}>
                  {(() => {
                    const completion = buildVerseCompletion(verseInput, verseSuggest)
                    if (!completion) return null
                    return (
                    <div
                      aria-hidden
                      style={{
                        position:'absolute',
                        inset:0,
                        padding:'10px 12px',
                        fontFamily:'var(--gc-font-family)',
                        color:'var(--gc-text-secondary)',
                        lineHeight:'normal',
                        whiteSpace:'pre',
                        overflow:'hidden',
                        textOverflow:'ellipsis',
                        pointerEvents:'none',
                      }}
                    >
                      <span style={{ visibility:'hidden' }}>{completion.prefix}</span>
                      <span>{completion.remainder}</span>
                    </div>
                    )
                  })()}
                  <input
                    id="verse-input"
                    value={verseInput}
                    onChange={(e) => { setVerseInput(e.target.value); if (verseError) setVerseError('') }}
                    placeholder="John 3:16"
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && buildVerseCompletion(verseInput, verseSuggest)) {
                        e.preventDefault()
                        applyVerseSuggestion()
                        return
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addVerseFromInput(verseInput)
                      }
                    }}
                    className="gc-input"
                    style={{ width:'100%', background:'transparent', position:'relative', zIndex:1, lineHeight:'normal' }}
                  />
                </div>
                <span className="gc-select" style={{ width:'100%' }}>
                  <select
                    id="verse-translation"
                    value={verseTranslation}
                    onChange={(e) => setVerseTranslation(e.target.value)}
                    style={{ width:'100%' }}
                  >
                    {translationGroups.map((group) => (
                      <optgroup key={group.languageCode} label={group.languageLabel}>
                        {group.translations.map((translation) => (
                          <option key={translation.id} value={translation.id}>
                            {translationOptionLabel(translation)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </span>
              </div>
            </div>
            {verseError ? <div className="meta" style={{ color:'var(--gc-danger)', marginTop: 6 }}>{verseError}</div> : null}
            <div className="row" style={{ justifyContent:'flex-end', gap:8, marginTop: 12 }}>
              <Button onClick={() => { setVerseOpen(false); setVerseError('') }}>Cancel</Button>
              <Button variant="primary" onClick={() => addVerseFromInput(verseInput)}>Add Verse</Button>
            </div>
          </div>
        </div>
      ) : null}
      <Busy busy={busy} />
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 12, marginBottom: 4}}>
        <div />
        <h1 style={{margin:0}}>Setlist Builder</h1>
        <div />
      </div>

      {/* Toolbar: mobile grid vs desktop/tablet full */}
      {isMobile ? (
        <Toolbar className="card" style={{ marginTop: 8, position: 'static' }}>
          <div className="setlist-actions--mobile" style={{ width:'100%' }}>
            <Button variant="primary" onClick={exportPdf} onMouseEnter={prefetchPdf} onFocus={prefetchPdf} disabled={busy || list.length===0} title="Export set as a single PDF" iconLeft={<DownloadIcon />}>PDF</Button>
            <Button onClick={combineSetlistPptx} disabled={list.length===0 || !!pptxProgress || !!combinePptxProgress} title={list.length===0 ? 'Add songs to combine PPTX files' : 'Combine PPTX files into a single presentation'} iconLeft={<DownloadIcon />}>{combinePptxProgress || 'Export PPT'}</Button>
            <Button onClick={bundlePptx} disabled={list.length===0 || !!pptxProgress || !!combinePptxProgress} title={list.length===0 ? 'Add songs to export PPTX bundle' : 'Export PPTX bundle (ZIP) for selected songs'} iconLeft={<DownloadIcon />}>PPT ZIP</Button>
            <Button onClick={copySetLink} title="Copy shareable link" iconLeft={<LinkIcon />} disabled={list.length===0}>Share</Button>
            <Button as={Link} to={(list.length ? `/worship/${list.map(s=> encodeURIComponent(s.id)).join(',')}?toKeys=${list.map(sel => encodeURIComponent(sel.toKey || '')).join(',')}` : '/worship')} title={'Open Worship Mode'} iconLeft={<MediaIcon />}>Worship</Button>
          </div>
        </Toolbar>
      ) : (
        <Toolbar className="card" style={{ marginTop: 8, position: 'static' }}>
          <div style={{ width: '100%', marginBottom: 6 }}>
            <strong title="Current set name">{name || 'New Setlist'}</strong>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', width:'100%' }}>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <Button size="sm" variant="secondary" onClick={onSave} title="Save set" iconLeft={<SaveIcon />}> <span className="text-when-wide">Save</span></Button>
              <Button size="sm" variant="secondary" onClick={onOpenLoad} title="Load saved set" iconLeft={<CloudDownloadIcon />} disabled={!savedSets.length}> <span className="text-when-wide">Load</span></Button>
              <Button size="sm" variant="secondary" onClick={onNew} title="New set" iconLeft={<PlusIcon />}> <span className="text-when-wide">New</span></Button>
              <Button size="sm" variant="secondary" onClick={onDelete} disabled={!currentId} title="Delete set" iconLeft={<TrashIcon />}> <span className="text-when-wide">Delete</span></Button>
              <Button size="sm" variant="secondary" onClick={copySetLink} title="Copy shareable link" iconLeft={<LinkIcon />} disabled={list.length===0}> <span className="text-when-wide">Share Set</span></Button>
            </div>
            <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <Button variant="primary" size="md" onClick={exportPdf} onMouseEnter={prefetchPdf} onFocus={prefetchPdf} disabled={busy || list.length===0} title="Export set as a single PDF" iconLeft={<DownloadIcon />}>{busy ? 'Exporting…' : <><span className="text-when-wide">Export PDF</span><span className="text-when-narrow">PDF</span></>}</Button>
              <Button variant="primary" size="md" onClick={combineSetlistPptx} disabled={list.length===0 || !!pptxProgress || !!combinePptxProgress} title={list.length===0 ? 'Add songs to combine PPTX files' : 'Combine PPTX files into a single presentation'} iconLeft={<DownloadIcon />}>{combinePptxProgress ? combinePptxProgress : <><span className="text-when-wide">Export PPT</span><span className="text-when-narrow">Export PPT</span></>}</Button>
              <Button variant="primary" size="md" onClick={bundlePptx} disabled={list.length===0 || !!pptxProgress || !!combinePptxProgress} title={list.length===0 ? 'Add songs to export PPTX bundle' : 'Export PPTX bundle (ZIP) for selected songs'} iconLeft={<DownloadIcon />}>{pptxProgress ? pptxProgress : <><span className="text-when-wide">PPT ZIP</span><span className="text-when-narrow">PPT ZIP</span></>}</Button>
              <Button variant="primary" size="md" as={Link} to={(list.length ? `/worship/${list.map(s=> encodeURIComponent(s.id)).join(',')}?toKeys=${list.map(sel => encodeURIComponent(sel.toKey || '')).join(',')}` : '/worship')} title={'Open Worship Mode'} iconLeft={<MediaIcon />}> <span className="text-when-wide">Worship Mode</span><span className="text-when-narrow">Worship</span></Button>
            </div>
          </div>
        </Toolbar>
      )}

      <div className="BuilderPage" style={{ marginTop: 8 }}>
        <div className="BuilderLeft">
          <section className="setlist-section setlist-add" data-role="add">
            <div className="card setlist-pane">
              <div className={["BuilderHeader", "section-header", isStacked ? 'no-sticky' : ''].filter(Boolean).join(' ')} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <strong style={{ whiteSpace:'nowrap' }}>Add songs</strong>
                <Input value={q} onChange={e=> setQ(e.target.value)} placeholder="Search..." style={{flex:1, minWidth:0}} />
                <label className="row" style={{gap:6, alignItems:'center'}}>
                  <input type="checkbox" checked={icpOnly} onChange={e=> setIcpOnly(e.target.checked)} />
                  <span className="meta" title="Limit results to songs tagged ICP">ICP only</span>
                </label>
              </div>
              {languageChipCodes.length > 0 ? (
                <div className={["BuilderHeader", "section-header", isStacked ? 'no-sticky' : ''].filter(Boolean).join(' ')} style={{ paddingTop: 0, display:'flex', alignItems:'center', gap:8 }}>
                  <span className="meta">Language</span>
                  <div className="tagbar">
                    {languageChipCodes.map((code) => (
                      <Chip
                        key={code}
                        variant="filter"
                        selected={selectedLanguage === code}
                        onClick={() => setSelectedLanguage(code)}
                        title={`Use ${getLanguageChipLabel(code)} where available`}
                      >
                        {getLanguageChipLabel(code)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className={["BuilderScroll", "setlist-scroll", "setlist-list", isStacked ? 'no-pane-scroll' : 'pane-scroll', 'pane--addSongs'].join(' ')}>
                {!fuse ? (
                  <div>Loading search…</div>
                ) : (
                  <div style={{ display:'grid', gap:'.5rem', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', marginTop:6 }}>
                    {results.map(s=> (
                      <SongCard
                        key={s.id}
                        title={s.title}
                        subtitle={`${s.originalKey || ''}${s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}`}
                        rightSlot={<Button aria-label="Add" title="Add to set" variant="primary" iconLeft={<PlusIcon />} iconOnly onClick={(e)=> { e.stopPropagation(); addSong(s) }} />}
                        onClick={() => addSong(s)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="BuilderRight" style={{ minHeight:0, display:'flex', flexDirection:'column' }}>
          <section className="setlist-section setlist-current" data-role="current">
            <div className="card setlist-pane">
              <div className={["BuilderHeader", "section-header", isStacked ? 'no-sticky' : ''].filter(Boolean).join(' ')} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <strong>Current setlist ({list.length})</strong>
                <Button size="sm" variant="secondary" onClick={() => { setVerseOpen(true); setVerseError('') }} iconLeft={<PlusIcon />}>Add Verse</Button>
              </div>
              <div className={["BuilderScroll", "setlist-scroll", "setlist-list", isStacked ? 'no-pane-scroll' : 'pane-scroll', 'pane--currentSet'].join(' ')} style={{ marginTop: 6 }}>
                {list.map((sel, idx)=>{
                  const isVerse = isVerseId(sel.id)
                  if (isVerse) {
                    const parsed = parseVerseId(sel.id)
                    const title = parsed?.refDisplay || sel.id
                    const translationLabel = resolveBibleTranslationLabel(parsed?.translation, bibleTranslations)
                    return (
                      <SongCard
                        key={sel.uid || `${sel.id}-${idx}`}
                        draggable
                        onDragStart={(e)=>{ e.dataTransfer.setData('text/plain', String(sel.uid || sel.id)); e.dataTransfer.effectAllowed = 'move' }}
                        onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                        onDrop={(e)=>{ e.preventDefault(); const srcId = e.dataTransfer.getData('text/plain'); moveToIndex(srcId, idx) }}
                        title={title}
                        subtitle={translationLabel}
                        rightSlot={
                          <div style={{display:'flex', alignItems:'center', gap:6}}>
                            <Button onClick={()=> move(sel.uid,'up')} title="Move up" iconLeft={<ArrowUp />} />
                            <Button onClick={()=> move(sel.uid,'down')} title="Move down" iconLeft={<ArrowDown />} />
                            <Button onClick={()=> removeSong(sel.uid)} title="Remove" iconLeft={<MinusIcon />} iconOnly style={{ color:'#b91c1c' }} />
                          </div>
                        }
                      />
                    )
                  }
                  const s = getSongById(sel.id)
                  if(!s) return null
                  return (
                    <SongCard
                      key={sel.uid || `${sel.id}-${idx}`}
                      draggable
                      onDragStart={(e)=>{ e.dataTransfer.setData('text/plain', String(sel.uid || sel.id)); e.dataTransfer.effectAllowed = 'move' }}
                      onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                      onDrop={(e)=>{ e.preventDefault(); const srcId = e.dataTransfer.getData('text/plain'); moveToIndex(srcId, idx) }}
                      title={s.title}
                      subtitle={`Original: ${s.originalKey || '—'}`}
                      rightSlot={
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <KeySelector
                            variant='ui'
                            baseKey={s.originalKey || 'C'}
                            valueKey={sel.toKey || s.originalKey || 'C'}
                            onChange={(full) => changeKey(sel.uid, full)}
                          />
                          <Button onClick={()=> move(sel.uid,'up')} title="Move up" iconLeft={<ArrowUp />} />
                          <Button onClick={()=> move(sel.uid,'down')} title="Move down" iconLeft={<ArrowDown />} />
                          <Button onClick={()=> removeSong(sel.uid)} title="Remove" iconLeft={<MinusIcon />} iconOnly style={{ color:'#b91c1c' }} />
                        </div>
                      }
                    />
                  )
                })}
              </div>
            </div>
          {/* Actions moved to toolbar above */}

          {/* Print-only minimal outline */}
          <div className="print-only" style={{marginTop:16}}>
            <h2 style={{fontSize:'20pt', margin:'0 0 8pt 0'}}>{name}</h2>
            <ol style={{fontSize:'12pt', lineHeight:1.4, paddingLeft:'1.2em'}}>
              {list.map((sel, idxPrint) => {
                if (isVerseId(sel.id)) {
                  const parsed = parseVerseId(sel.id)
                  const translationLabel = resolveBibleTranslationLabel(parsed?.translation, bibleTranslations)
                  return (
                    <li key={sel.uid || `${sel.id}-${idxPrint}`}>
                      {parsed?.refDisplay || sel.id} ({translationLabel})
                    </li>
                  )
                }
                const s = getSongById(sel.id)
                if (!s) return null
                return (
                  <li key={sel.uid || `${sel.id}-${idxPrint}`}>
                    {s.title} — {sel.toKey || s.originalKey || '—'}
                  </li>
                )
              })}
            </ol>
          </div>
          </section>
        </div>
      </div>
    </PageContainer>
  )
}
