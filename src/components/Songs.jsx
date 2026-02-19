import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import Fuse from 'fuse.js'
import { compareSongsByTitle } from '../utils/sort'
import indexData from '../data/index.json'
import { SongCard } from './ui/Card'
import Input from './ui/Input'
import { Chip } from './ui/layout-kit'
import { publicUrl } from '../utils/publicUrl'
import { isIncompleteSong } from '../utils/songStatus'
import { buildTagMap, canonicalizeTags, normalizeTagKey, tagLabelFromKey } from '../utils/tags'
import {
  buildGroupSearchText,
  buildSongCatalog,
  getLanguageChipLabel,
  hasGroupLanguage,
  resolveGroupEntry,
  resolveInitialSongLanguage,
  writeSongLanguagePreference,
} from '../utils/songCatalog'

const SITE_URL = 'https://gracechords.com'
const OG_IMAGE_URL = `${SITE_URL}/favicon.ico`
const SONGS_TITLE = 'Browse Songs — Free Worship Chord Sheets & Lyrics | GraceChords'
const SONGS_DESCRIPTION = 'Browse free worship chord sheets and lyrics for churches, worship teams, and believers. Build setlists and access transposable charts at GraceChords.'

export default function Songs(){
  const itemsRaw = indexData?.items || []
  const catalog = useMemo(() => buildSongCatalog(itemsRaw), [itemsRaw])
  const languageChipCodes = catalog.translationLanguages || []
  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    resolveInitialSongLanguage(languageChipCodes.length ? languageChipCodes : catalog.allLanguages)
  )
  const [searchParams] = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const [q, setQ] = useState(initialQ)

  useEffect(() => {
    writeSongLanguagePreference(selectedLanguage)
  }, [selectedLanguage])

  const tagMap = useMemo(() => buildTagMap(catalog.items), [catalog.items])
  const ICP_KEY = normalizeTagKey('ICP')

  const items = useMemo(() => {
    const out = []
    for (const group of catalog.groups || []) {
      let display = resolveGroupEntry(group, selectedLanguage)
      if (!display) continue
      if (isIncompleteSong(display)) {
        const fallback = group.variants.find((v) => !isIncompleteSong(v))
        if (!fallback) continue
        display = fallback
      }
      const { keys, labels } = canonicalizeTags(display.tags || [], tagMap)
      const searchTags = Array.from(
        new Set(group.variants.flatMap((v) => v.tags || []))
      )
      const searchAuthors = Array.from(
        new Set(group.variants.flatMap((v) => v.authors || []))
      )
      out.push({
        ...display,
        tags: labels,
        tagKeys: keys,
        hasSelectedLanguage: hasGroupLanguage(group, selectedLanguage),
        hasTranslations: group.variants.length > 1,
        group,
        searchTags,
        searchAuthors,
        searchText: buildGroupSearchText(group),
        searchTitles: group.variants.map((v) => v.title || '').filter(Boolean),
      })
    }
    return out
  }, [catalog.groups, selectedLanguage, tagMap])

  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const qLower = q.trim().toLowerCase()
  const allTags = useMemo(() => {
    const seen = new Set()
    const options = []
    for (const s of items) {
      for (const key of s.tagKeys || []) {
        if (!key || seen.has(key)) continue
        seen.add(key)
        options.push({ key, label: tagMap.get(key) || tagLabelFromKey(key) })
      }
    }
    return options.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
  }, [items, tagMap])

  const [selectedTags, setSelectedTags] = useState([])
  const [lyricsOn, setLyricsOn] = useState(false)
  const [icpOnly, setIcpOnly] = useState(() => {
    try { return localStorage.getItem('pref:icpOnly') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('pref:icpOnly', icpOnly ? '1' : '0') } catch {}
  }, [icpOnly])

  const [lyricsCache, setLyricsCache] = useState({})
  const fetchingRef = useRef(new Set())

  const fuse = useMemo(() => new Fuse(items, {
    includeScore: true,
    threshold: 0.35,
    ignoreLocation: true,
    keys: [
      { name: 'title',        weight: 0.65 },
      { name: 'searchTitles', weight: 0.6 },
      { name: 'tags',         weight: 0.25 },
      { name: 'searchTags',   weight: 0.2 },
      { name: 'authors',      weight: 0.15 },
      { name: 'searchAuthors',weight: 0.1 },
      { name: 'searchText',   weight: 0.05 },
    ]
  }), [items])

  function tagPass(s){
    if (!selectedTags.length) return true
    const tags = s.tagKeys || []
    return selectedTags.some((t) => tags.includes(t))
  }
  function icpPass(s){
    if (!icpOnly) return true
    const tags = s.tagKeys || []
    return tags.includes(ICP_KEY)
  }

  useEffect(() => {
    if (!lyricsOn || qLower.length === 0) return
    const shouldFetch = items
      .filter(tagPass)
      .filter(icpPass)
      .filter((s) => !(s.id in lyricsCache) && !fetchingRef.current.has(s.id))
      .slice(0, 200)
    if (!shouldFetch.length) return

    let cancelled = false
    ;(async () => {
      const next = {}
      for (const s of shouldFetch) {
        try {
          fetchingRef.current.add(s.id)
          const txt = await fetch(publicUrl(`songs/${s.filename}`)).then((r) => r.text())
          if (cancelled) return
          next[s.id] = (txt || '').toLowerCase()
        } catch {}
      }
      if (!cancelled && Object.keys(next).length) {
        setLyricsCache((prev) => ({ ...prev, ...next }))
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricsOn, qLower, items, selectedTags.join('|'), icpOnly])

  const resultParts = useMemo(() => {
    const scoreMap = new Map()
    let list

    if (qLower.length) {
      const rs = fuse.search(qLower)
      list = rs.map((r) => {
        scoreMap.set(r.item.id, r.score ?? 0)
        return r.item
      })
    } else {
      list = items.slice()
    }

    list = list.filter(tagPass).filter(icpPass)

    if (lyricsOn && qLower.length) {
      const extra = items
        .filter(tagPass)
        .filter(icpPass)
        .filter((s) => {
          const txt = lyricsCache[s.id]
          return typeof txt === 'string' ? txt.includes(qLower) : false
        })
      const byId = new Set(list.map((i) => i.id))
      for (const s of extra) {
        if (!byId.has(s.id)) list.push(s)
      }
    }

    list.sort((a, b) => {
      if (a.hasSelectedLanguage !== b.hasSelectedLanguage) {
        return a.hasSelectedLanguage ? -1 : 1
      }
      const aSW = qLower && a.title.toLowerCase().startsWith(qLower) ? 1 : 0
      const bSW = qLower && b.title.toLowerCase().startsWith(qLower) ? 1 : 0
      if (aSW !== bSW) return bSW - aSW

      const as = scoreMap.has(a.id) ? scoreMap.get(a.id) : Number.POSITIVE_INFINITY
      const bs = scoreMap.has(b.id) ? scoreMap.get(b.id) : Number.POSITIVE_INFINITY
      if (as !== bs) return as - bs

      return compareSongsByTitle(a, b)
    })

    const translated = []
    const fallback = []
    for (const item of list) {
      if (item.hasSelectedLanguage) translated.push(item)
      else fallback.push(item)
    }
    return { translated, fallback }
  }, [items, fuse, qLower, lyricsOn, lyricsCache, selectedTags.join('|'), icpOnly])

  const results = useMemo(
    () => [...resultParts.translated, ...resultParts.fallback],
    [resultParts]
  )
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionRefs = useRef([])
  const resetRef = useRef(false)

  function onSearchKeyDown(e){
    if(e.key === 'Enter'){
      e.preventDefault()
      const c = resultsRef.current
      if(!c) return
      const containerRect = c.getBoundingClientRect()
      const links = c.querySelectorAll('a')
      for(const link of links){
        const rect = link.getBoundingClientRect()
        if(rect.bottom > containerRect.top && rect.top < containerRect.bottom){
          link.click()
          break
        }
      }
    } else if(e.key === 'Escape') {
      e.preventDefault()
      setQ('')
      searchRef.current?.focus()
    } else if(e.key === 'ArrowDown') {
      e.preventDefault()
      if(results.length === 0) return
      if (activeIndex === 0) {
        optionRefs.current[0]?.focus()
      } else {
        setActiveIndex(0)
      }
    } else if(e.key === 'ArrowUp') {
      e.preventDefault()
      if(results.length === 0) return
      const last = results.length - 1
      setActiveIndex(last)
    }
  }

  function onResultsKeyDown(e){
    if(e.key === 'ArrowDown'){
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if(e.key === 'ArrowUp'){
      e.preventDefault()
      setActiveIndex((i) => {
        if(i <= 0){
          searchRef.current?.focus()
          return -1
        }
        return i - 1
      })
    }
  }

  useEffect(() => {
    if (activeIndex >= 0) {
      if (resetRef.current) {
        resetRef.current = false
      } else {
        optionRefs.current[activeIndex]?.focus()
      }
    }
  }, [activeIndex])

  useEffect(() => {
    if (results.length > 0) {
      setActiveIndex(0)
      resetRef.current = true
    } else {
      setActiveIndex(-1)
    }
  }, [results])

  useEffect(() => {
    const nextQ = searchParams.get('q') || ''
    setQ(nextQ)
  }, [searchParams])

  useEffect(() => {
    function onKeyDown(e){
      if(e.key === '/' && document.activeElement !== searchRef.current){
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    try {
      const isDesktop = window.matchMedia && window.matchMedia('(min-width: 821px)').matches
      if (isDesktop) searchRef.current?.focus()
    } catch {}
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function toggleTag(key){
    setSelectedTags((prev) => prev.includes(key) ? prev.filter((x) => x!==key) : [...prev, key])
  }
  function clearTags(){ setSelectedTags([]) }

  optionRefs.current = []

  return (
    <div className="HomePage">
      <Helmet>
        <title>{SONGS_TITLE}</title>
        <meta name="description" content={SONGS_DESCRIPTION} />
        <meta name="keywords" content="worship chord sheets, worship lyrics, transposable charts, GraceChords" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={SONGS_TITLE} />
        <meta property="og:description" content={SONGS_DESCRIPTION} />
        <meta property="og:url" content={`${SITE_URL}/songs`} />
        <meta property="og:site_name" content="GraceChords" />
        <meta property="og:image" content={OG_IMAGE_URL} />
        <link rel="canonical" href={`${SITE_URL}/songs`} />
      </Helmet>
      <div className="HomeHeader">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
          <h1 title="Browse Songs" style={{ marginBottom: 0 }}>Songs</h1>
          {languageChipCodes.length > 0 ? (
            <div className="tagbar" aria-label="Song language">
              {languageChipCodes.map((code) => (
                <Chip
                  key={code}
                  variant="filter"
                  selected={selectedLanguage === code}
                  onClick={() => setSelectedLanguage(code)}
                  title={`Show ${getLanguageChipLabel(code)} songs`}
                >
                  {getLanguageChipLabel(code)}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        <div className="card" style={{display:'grid', gap:10}}>
          <Input
            id="search"
            ref={searchRef}
            value={q}
            onChange={(e)=> setQ(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search title/tags/authors…"
            aria-label="Search songs"
          />
          <div className="row" style={{gap:8, alignItems:'center'}}>
            <label className="row" style={{gap:8, alignItems:'center'}}>
              <input
                type="checkbox"
                checked={lyricsOn}
                onChange={(e)=> setLyricsOn(e.target.checked)}
              />
              <span className="meta" title="Search within song texts (fetched on demand)">Lyrics contain</span>
            </label>
            <label className="row" style={{gap:8, alignItems:'center'}}>
              <input
                type="checkbox"
                checked={icpOnly}
                onChange={(e)=> setIcpOnly(e.target.checked)}
              />
              <span className="meta" title="Limit results to songs tagged ICP">ICP only</span>
            </label>
          </div>

          <div className="row">
            <div className="tagbar">
              <Chip variant="filter" selected={selectedTags.length===0} onClick={clearTags}>All</Chip>
              {allTags.map((t) => (
                <Chip
                  key={t.key}
                  variant="filter"
                  selected={selectedTags.includes(t.key)}
                  onClick={() => toggleTag(t.key)}
                >{t.label}</Chip>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="HomeResults"
        role="region"
        ref={resultsRef}
        onKeyDown={onResultsKeyDown}
      >
        <div className="HomeGrid" role="listbox" aria-label="Song results">
          {resultParts.translated.map((s, i) => (
            <SongCard
              as={Link}
              key={s.id}
              to={`/song/${s.id}`}
              role="option"
              ref={(el) => (optionRefs.current[i] = el)}
              tabIndex={i === activeIndex ? 0 : -1}
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'active' : ''}
              title={s.title}
              subtitle={`${s.originalKey || '—'}${s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}`}
            />
          ))}

          {resultParts.translated.length > 0 && resultParts.fallback.length > 0 ? (
            <div className="gc-translation-divider" role="separator">
              <span>No Translation in Selected Language</span>
            </div>
          ) : null}

          {resultParts.fallback.map((s, i) => {
            const idx = i + resultParts.translated.length
            return (
              <SongCard
                as={Link}
                key={s.id}
                to={`/song/${s.id}`}
                role="option"
                ref={(el) => (optionRefs.current[idx] = el)}
                tabIndex={idx === activeIndex ? 0 : -1}
                aria-selected={idx === activeIndex}
                className={idx === activeIndex ? 'active' : ''}
                title={s.title}
                subtitle={`${s.originalKey || '—'}${s.tags?.length ? ` • ${s.tags.join(', ')}` : ''}`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
