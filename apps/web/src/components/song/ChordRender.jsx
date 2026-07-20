import { useEffect, useRef, useState } from 'react'
import { transposeSymPrefer } from '../../utils/chordpro'
import { formatChord } from '../../utils/chordpro/solfege'
import { transposeInstrumental, formatInstrumental } from '../../utils/songs/instrumental'
import { buildChordRowsLayout } from '../../utils/songs/chordLineLayout'

// Shared chord/lyric render primitives. These were originally defined inside
// WorshipModePage; they are self-contained (props in, module-level utils only)
// so both Worship Mode and the live Session follower render identically from one
// implementation. Chords are canvas-measured and absolutely positioned above the
// `.lyrics` line (white-space: pre) via buildChordRowsLayout.

export function InstrumentalRow({ spec, steps, split, preferFlat, chordStyle = 'letters' }) {
  const inst = transposeInstrumental(spec, steps, preferFlat, { style: chordStyle })
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

export function ChordLine({ plain, chords, steps, showChords, preferFlat, chordStyle = 'letters' }) {
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const [state, setState] = useState({ rows: [{ text: '', offsets: [] }], padTop: 0 })
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
    if (!ctx || !lyr) {
      setState({ rows: [{ text: plain || '', offsets: [] }], padTop: 0 })
      return
    }
    const cs = window.getComputedStyle(lyr)

    const chordFamilyRaw = window.getComputedStyle(hostRef.current).getPropertyValue('--gc-font-chords')
    const chordFontFamily = chordFamilyRaw?.trim() || `'Fira Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    const chordFontSize = cs.fontSize
    const lyricFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const chordFont = `${cs.fontStyle} 700 ${chordFontSize} ${chordFontFamily}`
    const hostW = hostRef.current.getBoundingClientRect().width || 0
    const measureLyric = (text = '') => {
      ctx.font = lyricFont
      return ctx.measureText(text).width
    }
    const measureChord = (text = '') => {
      ctx.font = chordFont
      return ctx.measureText(text).width
    }
    const rows = buildChordRowsLayout({
      plain,
      chords: showChords ? chords : [],
      width: hostW,
      measureLyric,
      measureChord,
      transposeSym: (sym) => formatChord(transposeSymPrefer(sym, steps, preferFlat), { style: chordStyle }),
      spaceWidth: measureLyric(' ') || 0,
    })

    ctx.font = chordFont
    const chordM = ctx.measureText('Mg')
    const chordAscent = chordM.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8
    const gap = 4
    const padTop = Math.ceil(chordAscent + gap)
    setState({ rows, padTop })
  }, [plain, chords, steps, showChords, preferFlat, chordStyle, measureKey])

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
    <div ref={hostRef} style={{ marginBottom: 10 }}>
      {(state.rows || []).map((row, rowIndex) => (
        <div
          key={`${rowIndex}-${row.text}`}
          style={{ position:'relative', paddingTop: (showChords && row.offsets.length > 0) ? state.padTop : 0 }}
        >
          {showChords && row.offsets.length > 0 && (
            <div aria-hidden className="chord-layer" style={{position:'absolute', left:0, right:0, top:0}}>
              {row.offsets.map((c, i)=>(
                <span key={i} style={{ position:'absolute', left: `${c.left}px`, fontFamily: 'var(--gc-font-chords)', fontWeight: 700 }}>
                  {c.sym}
                </span>
              ))}
            </div>
          )}
          <div className="lyrics" style={{ whiteSpace:'pre', overflowWrap:'normal', fontSize:'inherit' }}>{row.text || ' '}</div>
        </div>
      ))}
    </div>
  )
}

export function VerseView({ sections, rtl = false }) {
  const lines = (sections || []).flatMap((sec) => sec.lines || [])
  if (!lines.length) return null
  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{maxWidth:900, margin:'0 auto', display:'grid', gap:10}}
    >
      {lines.map((ln, idx) => {
        const label = ln.showChapter ? `${ln.chapter}:${ln.number}` : `${ln.number}`
        return (
          <div key={idx} style={{display:'flex', gap:10, alignItems:'flex-start'}}>
            <span style={{minWidth: ln.showChapter ? 46 : 28, opacity:.6, fontWeight:600, textAlign: rtl ? 'left' : 'right'}}>{label}</span>
            <span style={{flex:1, whiteSpace:'pre-wrap', overflowWrap:'anywhere', textAlign: rtl ? 'right' : 'left'}}>{ln.text}</span>
          </div>
        )
      })}
    </div>
  )
}
