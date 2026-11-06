import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchSessionByCode, subscribeToSession, parseVerseId, resolveVerseLines, followerView } from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { useSongs, useSongContent, songContent } from '../hooks/useSongs'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { useSettings } from '../hooks/useSettings'
import { buildSongCatalog } from '../utils/songs/songCatalog'
import { fetchBibleChapter } from '../utils/bible/chapters'
import { ChordLine, InstrumentalRow, VerseView } from '../components/song/ChordRender'
import { Sun, Moon } from '../components/Icons'

// Live Session follower (web). Joined via a plain link at /s/{code}. Reads ONE
// `sessions` row (single source of truth: late-join snapshot + live stream) and
// follows the leader's current item in real time. The join code decides the
// content TIER: the chord tier renders chords in the leader's live key; the lyric
// tier renders lyrics only. Public songs render from the follower's own public
// catalog by slug; Bible verses fetch anonymously from /bible/* and render
// identically in both tiers; personal songs arrive as `unavailable` placeholders.
// The follower can free-scroll; a "leader moved on" pill catches up on a change.

// How often to re-evaluate leader staleness (followerView) between updates.
const TICK_MS = 5_000

// A fetched row's last_active_at, as the last time we know the leader wrote.
function signalFromRow(row) {
  const t = row && row.last_active_at ? Date.parse(row.last_active_at) : NaN
  return Number.isFinite(t) ? t : null
}

// Reader controls. The follower is a full-screen route with no NavBar, so the
// site's own theme switch is out of reach — the header carries its own. Font
// size is follower-local (the leader's view is unaffected) and persists, since
// a phone in a dark room is rejoined session after session.
const FONT_KEY = 'gracechords.session.fontPx'
const FONT_DEFAULT = 20
const FONT_MIN = 14
const FONT_MAX = 36
const FONT_STEP = 2

function readStoredFontPx() {
  try {
    const v = Number(localStorage.getItem(FONT_KEY))
    return Number.isFinite(v) && v >= FONT_MIN && v <= FONT_MAX ? v : FONT_DEFAULT
  } catch {
    return FONT_DEFAULT
  }
}

// Parse a catalog song's ChordPro into the section shape the renderer consumes.
// Chords are kept; the render decides per-tier whether to show them.
function buildSongView(song) {
  const doc = parseChordProOrLegacy(songContent(song))
  const title = doc?.meta?.title || song.title || song.id
  const sections = (doc.sections || []).map((sec) => ({
    label: sec.label,
    lines: (sec.lines || []).map((ln) => {
      if (ln.instrumental) return { instrumental: ln.instrumental }
      if (ln.comment) return { plain: ln.comment, comment: true }
      return { plain: ln.lyrics || '', chords: ln.chords || [], comment: false }
    }),
  }))
  return { title, sections }
}

// Adapter: resolveVerseLines(translationId, bookNumber, chapter) → chapter data
// via the anonymous same-origin /bible/* proxy.
function webFetchChapter(translationId, bookNumber, chapter) {
  return fetchBibleChapter({ translationId, book: String(bookNumber), chapter }).catch(() => null)
}

export default function SessionViewer() {
  const { code = '' } = useParams()
  const { chordStyle, theme, toggleTheme } = useSettings()
  const { songs: catalogSongs } = useSongs()
  const catalog = useMemo(() => buildSongCatalog(catalogSongs), [catalogSongs])

  const [session, setSession] = useState(null)
  const [tier, setTier] = useState('lyric') // 'chord' | 'lyric', from the join code
  const [phase, setPhase] = useState('loading') // loading | ready | notfound
  const [connected, setConnected] = useState(true)
  // Last time we saw the leader write: local receipt time for realtime UPDATEs,
  // the row's last_active_at for fetches.
  const [lastSignalAt, setLastSignalAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const [displayedUid, setDisplayedUid] = useState(null)
  const [autoFollow, setAutoFollow] = useState(true)
  const [fontPx, setFontPx] = useState(readStoredFontPx)

  // Resolved verse lines keyed by verse ref (cache across item changes).
  const [verseByRef, setVerseByRef] = useState({})

  const scrollRef = useRef(null)
  const showChords = tier === 'chord'

  // Late-join: fetch the row once (which resolves the tier), then subscribe.
  useEffect(() => {
    if (!code) return
    let alive = true
    let unsubscribe = () => {}

    ;(async () => {
      let row
      try {
        row = await fetchSessionByCode(supabase, code)
      } catch {
        if (alive) setPhase('notfound')
        return
      }
      if (!alive) return
      if (!row) {
        setPhase('notfound')
        return
      }
      setSession(row)
      setLastSignalAt(signalFromRow(row))
      setTier(row.tier === 'chord' ? 'chord' : 'lyric')
      setPhase('ready')
      unsubscribe = subscribeToSession(supabase, row.id, {
        onChange: (next) => {
          if (!alive) return
          setSession(next)
          setLastSignalAt(Date.now())
        },
        onStatus: (status) => {
          if (!alive) return
          if (status === 'SUBSCRIBED') {
            setConnected(true)
            fetchSessionByCode(supabase, code)
              .then((r) => {
                if (alive && r) {
                  setSession(r)
                  setLastSignalAt(signalFromRow(r))
                }
              })
              .catch(() => {})
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnected(false)
          }
        },
      })
    })()

    return () => {
      alive = false
      unsubscribe()
    }
  }, [code])

  // Re-evaluate leader staleness between updates.
  useEffect(() => {
    if (phase !== 'ready') return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [phase])

  const leaderUid = session?.current_item_uid || null
  const { content, banner } = followerView({ row: session, connected, lastSignalAt, now })
  const behind = phase === 'ready' && !!leaderUid && !!displayedUid && leaderUid !== displayedUid

  useEffect(() => {
    if (!session) return
    // Nothing open: the next song the leader opens should land without a tap.
    if (!session.current_item_uid && !autoFollow) {
      setAutoFollow(true)
      return
    }
    if (autoFollow) {
      setDisplayedUid(session.current_item_uid || null)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.current_item_uid, autoFollow])

  const items = useMemo(() => session?.items || [], [session])
  const displayedItem = useMemo(
    () => items.find((it) => it.uid === displayedUid) || items[0] || null,
    [items, displayedUid],
  )

  // Resolve + parse the displayed public song from the follower's own catalog.
  const displayedSong = displayedItem?.kind === 'song'
    ? catalog?.byId?.get(String(displayedItem.slug)) || null
    : null
  const displayedSongReady = useSongContent(displayedSong ? [displayedSong] : [])
  const view = useMemo(() => {
    const song = displayedSong
    if (!song || !displayedSongReady) return null
    try {
      return buildSongView(song)
    } catch {
      return null
    }
  }, [displayedSong, displayedSongReady])

  // Fetch verse content anonymously (cache-first), for every verse item on join
  // and whenever the displayed item is a verse.
  useEffect(() => {
    let alive = true
    const verseRefs = items.filter((it) => it.kind === 'verse' && it.ref).map((it) => it.ref)
    for (const ref of verseRefs) {
      if (verseByRef[ref]) continue
      const parsed = parseVerseId(ref)
      if (!parsed) continue
      resolveVerseLines(parsed, webFetchChapter)
        .then((res) => {
          if (alive) setVerseByRef((prev) => (prev[ref] ? prev : { ...prev, [ref]: res.lines }))
        })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [items, verseByRef])

  const steps = showChords ? (((((session?.transpose || 0) % 12) + 12) % 12)) : 0
  const preferFlat = String(session?.current_key || '').includes('b')

  const onScroll = (e) => {
    const top = e.currentTarget.scrollTop
    if (top > 40 && autoFollow) setAutoFollow(false)
    else if (top <= 4 && !autoFollow && !behind) setAutoFollow(true)
  }

  const catchUp = () => {
    setAutoFollow(true)
    setDisplayedUid(leaderUid)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const stepFont = (dir) => {
    setFontPx((px) => {
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, px + dir * FONT_STEP))
      try { localStorage.setItem(FONT_KEY, String(next)) } catch { /* private mode */ }
      return next
    })
  }

  // ---------- Render ----------
  if (phase === 'loading') {
    return <div style={SHELL}><div style={CENTER}>Joining session…</div></div>
  }
  if (phase === 'notfound') {
    return (
      <div style={SHELL}>
        <div style={CENTER}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Session not found</h1>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>This session may have ended or the link is incorrect.</p>
          <Link to="/" style={LINK}>Go to GraceChords</Link>
        </div>
      </div>
    )
  }
  if (session?.status === 'ended') {
    return (
      <div style={SHELL}>
        <div style={CENTER}>
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>Thanks for joining our session!</h1>
          <p style={{ opacity: 0.75, marginBottom: 18 }}>The session has ended.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" style={LINK}>Continue on the web</Link>
            <Link to="/about" style={LINK}>Check out the app</Link>
          </div>
        </div>
      </div>
    )
  }

  const waiting = content === 'waiting'
  const isVerse = !waiting && displayedItem?.kind === 'verse'
  const verseLines = isVerse && displayedItem?.ref ? verseByRef[displayedItem.ref] : null

  return (
    <div style={SHELL}>
      {/* Header */}
      <div style={HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={LIVE_DOT} aria-hidden />
          <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>LIVE</span>
          <span style={{ opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {waiting ? '' : displayedItem?.title || ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {showChords && !waiting && !isVerse && session?.current_key ? (
            <span style={{ ...KEY_PILL, marginRight: 4 }}>Key: {session.current_key}</span>
          ) : null}
          <button
            type="button"
            onClick={() => stepFont(-1)}
            disabled={fontPx <= FONT_MIN}
            title="Smaller text"
            aria-label="Smaller text"
            style={{ ...CTRL, ...(fontPx <= FONT_MIN ? CTRL_OFF : null), fontSize: 13 }}
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => stepFont(1)}
            disabled={fontPx >= FONT_MAX}
            title="Larger text"
            aria-label="Larger text"
            style={{ ...CTRL, ...(fontPx >= FONT_MAX ? CTRL_OFF : null), fontSize: 17 }}
          >
            A+
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={CTRL}
          >
            {theme === 'dark' ? <Sun width={16} height={16} /> : <Moon width={16} height={16} />}
          </button>
        </div>
      </div>

      {banner ? (
        <div style={RECONNECT} role="status" aria-live="polite">
          {banner === 'offline' ? 'You’re offline — reconnecting…' : 'Leader disconnected — showing the last song.'}
        </div>
      ) : null}

      {/* Content */}
      <div ref={scrollRef} onScroll={onScroll} style={CONTENT}>
        {waiting ? (
          <div style={CENTER}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Waiting for the leader…</h2>
            <p style={{ opacity: 0.6 }}>The leader doesn’t have a song open right now.</p>
          </div>
        ) : isVerse ? (
          verseLines ? (
            <div style={{ maxWidth: 900, margin: '0 auto', fontSize: fontPx }}>
              <VerseView sections={[{ label: '', lines: verseLines }]} />
            </div>
          ) : (
            <div style={CENTER}>Loading verse…</div>
          )
        ) : displayedItem && displayedItem.kind !== 'song' ? (
          <div style={CENTER}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>{displayedItem.title || 'This item'}</h2>
            <p style={{ opacity: 0.6 }}>Not available in this view.</p>
          </div>
        ) : view ? (
          // Keyed on the size: ChordLine canvas-measures chord offsets in an
          // effect that runs on mount, so remounting is what re-lays-out the
          // chord layer against the new font metrics.
          <div key={fontPx} style={{ maxWidth: 1200, margin: '0 auto', fontSize: fontPx }}>
            {view.sections.map((sec, si) => (
              <div key={si} style={{ breakInside: 'avoid', marginBottom: 6 }}>
                {sec.label ? <div className="section" style={SECTION}>[{sec.label}]</div> : null}
                {(sec.lines || []).map((ln, li) =>
                  ln.instrumental ? (
                    // Chord-only lines only appear in the chord tier.
                    showChords ? (
                      <InstrumentalRow
                        key={`${si}-${li}`}
                        spec={ln.instrumental}
                        steps={steps}
                        preferFlat={preferFlat}
                        split={false}
                        chordStyle={chordStyle}
                      />
                    ) : null
                  ) : ln.comment ? (
                    <div key={`${si}-${li}`} className="comment" style={COMMENT}>{ln.plain}</div>
                  ) : (
                    <ChordLine
                      key={`${si}-${li}`}
                      plain={ln.plain}
                      chords={showChords ? ln.chords : []}
                      steps={steps}
                      preferFlat={preferFlat}
                      showChords={showChords}
                      chordStyle={chordStyle}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={CENTER}>Loading song…</div>
        )}
      </div>

      {/* Catch-up pill */}
      {behind ? (
        <button onClick={catchUp} style={PILL} aria-live="polite">
          Leader moved on — tap to catch up
        </button>
      ) : null}
    </div>
  )
}

// --- Inline styles (self-contained; the follower is a standalone full-screen
// route with no NavBar, like Worship Mode). ---
const SHELL = {
  position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
  background: 'var(--gc-bg, #fff)', color: 'var(--gc-text, #111)',
}
const HEADER = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 16px', borderBottom: '1px solid var(--gc-separator, rgba(0,0,0,.1))', gap: 12,
}
const CONTENT = { flex: 1, overflowY: 'auto', padding: '16px 18px 96px' }
const CENTER = { minHeight: '60%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }
const SECTION = { fontWeight: 700, opacity: 0.7, margin: '10px 0 4px' }
const COMMENT = { fontStyle: 'italic', opacity: 0.75, marginBottom: 8 }
const KEY_PILL = { background: 'var(--gc-surface-2, rgba(0,0,0,.06))', borderRadius: 999, padding: '4px 12px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }
const LIVE_DOT = { width: 9, height: 9, borderRadius: 999, background: '#e0245e', flexShrink: 0 }
const RECONNECT = { textAlign: 'center', padding: '6px 12px', fontSize: 13, background: 'var(--gc-surface-2, rgba(0,0,0,.06))', opacity: 0.85 }
const PILL = {
  position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
  background: 'var(--gc-primary, #2563eb)', color: '#fff', border: 'none', borderRadius: 999,
  padding: '12px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.25)',
}
const LINK = { color: 'var(--gc-primary, #2563eb)', fontWeight: 600, textDecoration: 'none' }
// Reader controls: deliberately quiet (they sit beside a LIVE badge and must not
// compete with the lyrics), but still a 36px touch target.
const CTRL = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 36, height: 36, padding: '0 8px', background: 'transparent',
  border: 'none', borderRadius: 8, color: 'inherit', opacity: 0.55,
  fontWeight: 700, lineHeight: 1, cursor: 'pointer',
}
const CTRL_OFF = { opacity: 0.2, cursor: 'default' }
