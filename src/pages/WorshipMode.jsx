// src/pages/WorshipMode.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import indexData from '../data/index.json'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { stepsBetween, transposeSym } from '../utils/chordpro'
import { applyTheme, currentTheme, toggleTheme } from '../utils/theme'
import { Sun, Moon, PlusIcon, OneColIcon, TwoColIcon, HomeIcon } from '../components/Icons'
import { resolveChordCollisions } from '../utils/chords'

const PT_WINDOW = [16, 15, 14, 13, 12]

const LS = {
  transpose: 'worship:transpose',
  showChords: 'worship:showChords',
  fontSize: 'worship:fontSize',
}

export default function WorshipMode(){
  const { songIds = '' } = useParams()
  const navigate = useNavigate()
  const ids = useMemo(() => songIds.split(',').map(s => s.trim()).filter(Boolean), [songIds])

  const [songs, setSongs] = useState([]) // [{ id, title, baseKey, sections }]
  const [idx, setIdx] = useState(0)
  const [transpose, setTranspose] = useState(() => {
    try { return parseInt(localStorage.getItem(LS.transpose) || '0', 10) || 0 } catch { return 0 }
  })
  const [showChords, setShowChords] = useState(() => {
    try { return localStorage.getItem(LS.showChords) !== '0' } catch { return true }
  })
  const [fontPx, setFontPx] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(LS.fontSize) || '', 10)
      return Number.isFinite(v) ? v : null
    } catch { return null }
  })
  const [autoSize, setAutoSize] = useState(() => fontPx == null)

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const headerRef = useRef(null)
  const barRef = useRef(null)
  const touchRef = useRef({ x: 0, y: 0, at: 0 })
  const [cols, setCols] = useState(1)
  const [isWide, setIsWide] = useState(() => {
    try { const vw = window.innerWidth, vh = window.innerHeight; return (vw >= 900) || (vw / Math.max(1, vh) >= 1.2) } catch { return false }
  })
  const [, setThemeBump] = useState(0)
  const [availH, setAvailH] = useState(null)

  // Quick add/search state
  const [q, setQ] = useState('')
  const [openSuggest, setOpenSuggest] = useState(false)
  const searchRef = useRef(null)
  const items = indexData?.items || []
  const titleResults = useMemo(() => {
    if (!q.trim()) return []
    const s = q.trim().toLowerCase()
    return items.filter(it => (it.title || '').toLowerCase().includes(s)).slice(0, 5)
  }, [q, items])

  useEffect(() => {
    function onResize(){
      try {
        const vw = window.innerWidth, vh = window.innerHeight
        setIsWide((vw >= 900) || (vw / Math.max(1, vh) >= 1.2))
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

  // Load songs by ids
  useEffect(() => {
    let cancelled = false
    async function load(){
      const items = indexData?.items || []
      const targets = ids.map(id => items.find(it => String(it.id) === id)).filter(Boolean)
      const out = []
      for (const s of targets) {
        try {
          const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
          const res = await fetch(`${base}songs/${s.filename}`)
          if (!res.ok) throw new Error(`Failed ${s.filename}`)
          const txt = await res.text()
          const doc = parseChordProOrLegacy(txt)
          const title = doc?.meta?.title || s.title || s.id
          const baseKey = doc?.meta?.key || doc?.meta?.originalkey || s.originalKey || 'C'
          const sections = (doc.sections || []).map(sec => ({
            label: sec.label,
            lines: (sec.lines || []).map(ln => ({
              plain: ln.comment ? ln.comment : (ln.lyrics || ''),
              chords: ln.chords || [],
              comment: !!ln.comment,
            }))
          }))
          out.push({ id: s.id, title, baseKey, sections })
        } catch (err) {
          console.error(err)
        }
      }
      if (!cancelled) setSongs(out)
      if (!cancelled) setIdx(0)
    }
    load()
    return () => { cancelled = true }
  }, [songIds])

  // Fit-to-viewport with column preference: on wide screens, prefer 2 columns to keep larger text.
  useEffect(() => {
    if (!autoSize) return
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const prevSize = content.style.fontSize
    const prevCols = content.style.columnCount
    const prevGap = content.style.columnGap
    try {
      const colPref = isWide ? [2, 1] : [1, 2]
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
    const prevSize = content.style.fontSize
    const prevCols = content.style.columnCount
    const prevGap = content.style.columnGap
    try {
      // First try current columns
      content.style.fontSize = `${fontPx || 16}px`
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
  }, [fontPx, autoSize, cols])

  // Persist toggles
  useEffect(() => {
    try { localStorage.setItem(LS.transpose, String(transpose)) } catch {}
  }, [transpose])
  useEffect(() => {
    try { localStorage.setItem(LS.showChords, showChords ? '1' : '0') } catch {}
  }, [showChords])
  useEffect(() => {
    if (fontPx != null) try { localStorage.setItem(LS.fontSize, String(fontPx)) } catch {}
  }, [fontPx])

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
    }
  }

  function next(){ setQ(''); setOpenSuggest(false); setIdx(i => Math.min((songs.length - 1), i + 1)) }
  function prev(){ setQ(''); setOpenSuggest(false); setIdx(i => Math.max(0, i - 1)) }

  async function addSongAfterCurrent(idToAdd){
    try {
      const entry = (indexData?.items || []).find(it => String(it.id) === String(idToAdd))
      if (!entry) return
      const base = ((import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/')
      const res = await fetch(`${base}songs/${entry.filename}`)
      if (!res.ok) return
      const txt = await res.text()
      const doc = parseChordProOrLegacy(txt)
      const title = doc?.meta?.title || entry.title || entry.id
      const baseKey = doc?.meta?.key || doc?.meta?.originalkey || entry.originalKey || 'C'
      const sections = (doc.sections || []).map(sec => ({
        label: sec.label,
        lines: (sec.lines || []).map(ln => ({
          plain: ln.comment ? ln.comment : (ln.lyrics || ''),
          chords: ln.chords || [],
          comment: !!ln.comment,
        }))
      }))
      // Insert after current index
      setSongs(prev => {
        const copy = prev.slice()
        copy.splice(Math.min(prev.length, idx + 1), 0, { id: entry.id, title, baseKey, sections })
        // Update URL for persistence
        const newIds = copy.map(s => s.id)
        navigate(`/worship/${newIds.join(',')}`)
        return copy
      })
      setQ(''); setOpenSuggest(false)
    } catch (err) {
      console.error(err)
    }
  }

  const cur = songs[idx]
  const toKey = useMemo(() => (cur ? transposeSym(cur.baseKey, transpose) : 'C'), [cur?.baseKey, transpose])
  const steps = useMemo(() => (cur ? stepsBetween(cur.baseKey, toKey) : 0), [cur?.baseKey, toKey])

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
          <button className="btn" onClick={() => navigate('/')}>Back</button>
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
        {/* Title row */}
        <div ref={headerRef} style={{padding:'10px 16px', textAlign:'center'}}>
          <div style={{fontWeight:700, fontSize:'clamp(20px, 4vw, 28px)'}}>{cur?.title || ''}</div>
          <div style={{opacity:.75, fontSize:14, marginTop:2}}>Key: {toKey} {cur?.baseKey && toKey !== cur.baseKey ? `(orig ${cur.baseKey})` : ''}</div>
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
        {/* Top-right theme toggle */}
        <button
          className="iconbtn"
          aria-label="Toggle dark mode"
          title={currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => { toggleTheme(); setThemeBump(x => x + 1) }}
          style={{ position:'fixed', top:10, right:10, zIndex:5, padding:'10px 12px' }}
        >
          {currentTheme() === 'dark' ? <Sun /> : <Moon />}
        </button>
        {/* Manual column toggle next to theme */}
        <button
          className="iconbtn"
          aria-label="Toggle columns"
          title={cols === 2 ? 'Switch to 1 column' : 'Switch to 2 columns'}
          onClick={() => {
            const target = (cols === 2 ? 1 : 2)
            setAutoSize(false)
            const viewport = viewportRef.current
            const content = contentRef.current
            if (!viewport || !content) { setCols(target); return }
            const prevSize = content.style.fontSize
            const prevCols = content.style.columnCount
            const prevGap = content.style.columnGap
            try {
              let pt = fontPx || 16
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
          style={{ position:'fixed', top:10, right:60, zIndex:5, padding:'10px 12px' }}
        >
          {cols === 2 ? <OneColIcon size={18} /> : <TwoColIcon size={18} />}
        </button>

        {/* Content area */}
        <div
          ref={contentRef}
          className="worship__content"
          style={{
            flex:'1 1 auto', minHeight:0, overflow:'auto', padding:'10px 16px 12px',
            fontSize: fontPx ? `${fontPx}px` : undefined,
            lineHeight: 1.35,
            columnCount: cols,
            columnGap: cols === 2 ? '20px' : undefined,
            maxHeight: availH ? `${availH}px` : undefined,
          }}
        >
          {cur ? (
            <div className="worship__song" style={{maxWidth:1200, margin:'0 auto'}}>
              {(cur.sections || []).map((sec, si) => (
                <div key={si} style={{breakInside:'avoid'}}>
                  {sec.label ? <div className="section">[{sec.label}]</div> : null}
                  {(sec.lines || []).map((ln, li) => (
                    ln.comment ? (
                      <div key={`${si}-${li}`} className="comment" style={{fontStyle:'italic', opacity:.75, margin:'2px 0 10px', fontSize:'0.92em'}}>{ln.plain}</div>
                    ) : (
                      <ChordLine
                        key={`${si}-${li}`}
                        plain={ln.plain}
                        chords={ln.chords}
                        steps={steps}
                        showChords={showChords}
                      />
                    )
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Toolbar */}
        <div ref={barRef} className="worship__bar" role="toolbar" aria-label="Worship controls" style={{
          position:'fixed', left:0, right:0, bottom:0,
          display:'flex', gap:8, alignItems:'center', justifyContent:'space-between',
          padding:'12px 14px', background:'var(--card)', borderTop:'1px solid var(--line)'
        }}>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <button className="btn" style={{padding:'12px 16px', fontSize:16}} onClick={() => setShowChords(v => !v)} title="Toggle chords">{showChords ? 'Chords On' : 'Chords Off'}</button>
            <button className="btn" style={{padding:'12px 16px', fontSize:16}} onClick={() => { setTranspose(t => t + 2) }} title="Raise key">Key Up ♯</button>
            <button className="btn" style={{padding:'12px 16px', fontSize:16}} onClick={() => { const delta = stepsBetween(toKey, cur?.baseKey || 'C'); setTranspose(t => t + delta) }} title="Reset key">Reset Key</button>
          </div>
          {/* Center quick search (drop-up) */}
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
                    <button className="btn iconbtn" aria-label={`Add ${s.title}`} onClick={() => addSongAfterCurrent(s.id)}><PlusIcon /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <button className="btn" style={{padding:'12px 16px', fontSize:16}} onClick={() => { setAutoSize(false); setFontPx(px => Math.max(10, (px || 16) - 1)) }} title="Smaller font">A−</button>
            <button className="btn" style={{padding:'12px 16px', fontSize:16}} onClick={() => { setAutoSize(false); setFontPx(px => Math.min(40, (px || 16) + 1)) }} title="Larger font">A+</button>
            {idx > 0 && (
              <button className="btn" style={{padding:'12px 18px', fontSize:16}} onClick={prev} title="Previous song">← BACK</button>
            )}
            {idx < songs.length - 1 && (
              <button className="btn primary" style={{padding:'12px 18px', fontSize:16}} onClick={next} title="Next song">NEXT →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChordLine({ plain, chords, steps, showChords }){
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
    const cs = window.getComputedStyle(lyr)

    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const spaceW = ctx.measureText(' ').width || 6
    const measured = (showChords ? chords : []).map(c => {
      const left = ctx.measureText(plain.slice(0, c.index || 0)).width
      const sym = transposeSym(c.sym, steps)
      return { sym, x: left, w: 0 }
    })

    const chordFontFamily = `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
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
    <div ref={hostRef} style={{position:'relative', marginBottom:10, paddingTop: showChords ? state.padTop : 0}}>
      {showChords && state.offsets.length>0 && (
        <div aria-hidden className="chord-layer" style={{position:'absolute', left:0, right:0, top: state.chordTop}}>
          {state.offsets.map((c, i)=>(
            <span key={i} style={{ position:'absolute', left: `${c.left}px`, fontFamily: `'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`, fontWeight: 700 }}>
              {c.sym}
            </span>
          ))}
        </div>
      )}
      <div className="lyrics" style={{whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{plain}</div>
    </div>
  )
}
