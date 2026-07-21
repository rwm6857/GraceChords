import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchSessionByCode, subscribeToSession, parseVerseId, resolveVerseLines } from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { useSongs } from '../hooks/useSongs'
import { parseChordProOrLegacy } from '../utils/chordpro/parser'
import { useChordStyle } from '../hooks/useSettings'
import { buildSongCatalog } from '../utils/songs/songCatalog'
import { fetchBibleChapter } from '../utils/bible/chapters'
import { isMobile } from '../utils/app/platform'
import { ChordLine, InstrumentalRow, VerseView } from '../components/song/ChordRender'

// Live Session follower (web). Joined via a plain link at /s/{code}. Reads ONE
// `sessions` row (single source of truth: late-join snapshot + live stream) and
// follows the leader's current item in real time. The join code decides the
// content TIER: the chord tier renders chords in the leader's live key; the lyric
// tier renders lyrics only. Public songs render from the follower's own public
// catalog by slug; Bible verses fetch anonymously from /bible/* and render
// identically in both tiers; personal songs arrive as `unavailable` placeholders.
// The follower can free-scroll; a "leader moved on" pill catches up on a change.

// After this long without any realtime signal following a drop, soften the
// "reconnecting" hint (we still HOLD the last-known state either way).
const GRACE_MS = 50_000
const BANNER_DISMISS_KEY = 'session:appBannerDismissed'

// Parse a catalog song's ChordPro into the section shape the renderer consumes.
// Chords are kept; the render decides per-tier whether to show them.
function buildSongView(song) {
  const doc = parseChordProOrLegacy(song.chordpro_content || '')
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

function bannerInitiallyDismissed() {
  try {
    return localStorage.getItem(BANNER_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export default function SessionViewer() {
  const { code = '' } = useParams()
  const chordStyle = useChordStyle()
  const { songs: catalogSongs } = useSongs()
  const catalog = useMemo(() => buildSongCatalog(catalogSongs), [catalogSongs])

  const [session, setSession] = useState(null)
  const [tier, setTier] = useState('lyric') // 'chord' | 'lyric', from the join code
  const [phase, setPhase] = useState('loading') // loading | ready | notfound
  const [connected, setConnected] = useState(true)
  const [staleReconnect, setStaleReconnect] = useState(false)

  const [bannerDismissed, setBannerDismissed] = useState(bannerInitiallyDismissed)

  const [displayedUid, setDisplayedUid] = useState(null)
  const [autoFollow, setAutoFollow] = useState(true)

  // Resolved verse lines keyed by verse ref (cache across item changes).
  const [verseByRef, setVerseByRef] = useState({})

  const scrollRef = useRef(null)
  const graceTimer = useRef(null)
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
      setTier(row.tier === 'chord' ? 'chord' : 'lyric')
      setPhase('ready')
      unsubscribe = subscribeToSession(supabase, row.id, {
        onChange: (next) => {
          if (alive) setSession(next)
        },
        onStatus: (status) => {
          if (!alive) return
          if (status === 'SUBSCRIBED') {
            setConnected(true)
            setStaleReconnect(false)
            fetchSessionByCode(supabase, code)
              .then((r) => { if (alive && r) setSession(r) })
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

  // Grace window: after a drop, soften the hint but keep holding state.
  useEffect(() => {
    if (connected) {
      setStaleReconnect(false)
      if (graceTimer.current) clearTimeout(graceTimer.current)
      return
    }
    graceTimer.current = setTimeout(() => setStaleReconnect(true), GRACE_MS)
    return () => { if (graceTimer.current) clearTimeout(graceTimer.current) }
  }, [connected])

  const leaderUid = session?.current_item_uid || null
  const behind = phase === 'ready' && !!displayedUid && leaderUid !== displayedUid

  useEffect(() => {
    if (!session) return
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
  const view = useMemo(() => {
    if (!displayedItem || displayedItem.kind !== 'song') return null
    const song = catalog?.byId?.get(String(displayedItem.slug))
    if (!song) return null
    try {
      return buildSongView(song)
    } catch {
      return null
    }
  }, [displayedItem, catalog])

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

  const openInApp = () => {
    try {
      window.location.href = `gracechords://s/${encodeURIComponent(code)}`
    } catch {
      /* no-op */
    }
  }

  const dismissBanner = () => {
    setBannerDismissed(true)
    try {
      localStorage.setItem(BANNER_DISMISS_KEY, '1')
    } catch {
      /* ignore storage failures */
    }
  }

  const showBanner = phase === 'ready' && session?.status !== 'ended' && !bannerDismissed && isMobile()

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

  const isVerse = displayedItem?.kind === 'verse'
  const verseLines = isVerse && displayedItem?.ref ? verseByRef[displayedItem.ref] : null

  return (
    <div style={SHELL}>
      {/* Header */}
      <div style={HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={LIVE_DOT} aria-hidden />
          <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>LIVE</span>
          <span style={{ opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayedItem?.title || ''}
          </span>
        </div>
        {showChords && !isVerse && session?.current_key ? (
          <span style={KEY_PILL}>Key: {session.current_key}</span>
        ) : null}
      </div>

      {/* Passive "open in app" banner (mobile only, dismissible). */}
      {showBanner ? (
        <div style={BANNER} role="region" aria-label="Open in app">
          <span style={{ flex: 1, minWidth: 0 }}>Following on the web — open in the GraceChords app.</span>
          <button onClick={openInApp} style={BANNER_BTN}>Open in app</button>
          <button onClick={dismissBanner} style={BANNER_X} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      {!connected ? (
        <div style={RECONNECT} role="status" aria-live="polite">
          {staleReconnect ? 'Waiting for the leader…' : 'Reconnecting…'}
        </div>
      ) : null}

      {/* Content */}
      <div ref={scrollRef} onScroll={onScroll} style={CONTENT}>
        {isVerse ? (
          verseLines ? (
            <div style={{ maxWidth: 900, margin: '0 auto', fontSize: 20 }}>
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
          <div style={{ maxWidth: 1200, margin: '0 auto', fontSize: 20 }}>
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
const BANNER = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
  background: 'var(--gc-surface-2, rgba(0,0,0,.06))', fontSize: 14,
  borderBottom: '1px solid var(--gc-separator, rgba(0,0,0,.1))',
}
const BANNER_BTN = {
  background: 'var(--gc-primary, #2563eb)', color: '#fff', border: 'none', borderRadius: 999,
  padding: '6px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
}
const BANNER_X = {
  background: 'transparent', border: 'none', color: 'inherit', fontSize: 20, lineHeight: 1,
  cursor: 'pointer', padding: '0 4px', opacity: 0.6, flexShrink: 0,
}
const PILL = {
  position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
  background: 'var(--gc-primary, #2563eb)', color: '#fff', border: 'none', borderRadius: 999,
  padding: '12px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.25)',
}
const LINK = { color: 'var(--gc-primary, #2563eb)', fontWeight: 600, textDecoration: 'none' }
