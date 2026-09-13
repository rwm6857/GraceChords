import React from 'react'
import { describe, it, beforeEach, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The follower reads its song content from the public catalog via useSongs().
vi.mock('../../hooks/useSongs', () => ({
  useSongs: () => ({
    songs: [
      {
        dbId: 's1', id: 'abba', songId: 'abba', title: 'Abba', language: 'en',
        originalKey: 'Am', tags: [], authors: [],
        chordpro_content: 'title: Abba\nkey: Am\n[Verse]\nFather we love You\n',
      },
    ],
    loading: false,
  }),
}))

// Session row + realtime come from @gracechords/core; the viewer only uses these
// two exports from the barrel, so a focused mock is enough.
const sessionMock = vi.hoisted(() => ({ row: null }))
vi.mock('@gracechords/core', () => ({
  fetchSessionByCode: vi.fn(async () => sessionMock.row),
  subscribeToSession: vi.fn(() => () => {}),
  parseVerseId: (id) => ({
    id, translation: 'esv', bookNumber: 43, refDisplay: 'John 3:16',
    segments: [{ chapter: 3, ranges: [{ start: 16, end: 16 }] }],
  }),
  resolveVerseLines: vi.fn(async () => ({
    lines: [{ verse: true, chapter: 3, number: 16, text: 'For God so loved the world', showChapter: false }],
  })),
}))

// Verse text is fetched anonymously via the /bible proxy.
vi.mock('../../utils/bible/chapters', () => ({
  fetchBibleChapter: vi.fn(async () => ({ verses: { '16': 'For God so loved the world' } })),
}))

// Platform detection drives the mobile-only "open in app" banner. Toggle per test.
import SessionViewer from '../SessionViewerPage'
import { SettingsProvider } from '../../hooks/useSettings'

// Mirrors main.jsx: the follower reads theme + chord style from SettingsProvider.
function renderAt(code = 'ABC123') {
  return render(
    <SettingsProvider>
      <MemoryRouter initialEntries={[`/s/${code}`]}>
        <Routes>
          <Route path="/s/:code" element={<SessionViewer />} />
        </Routes>
      </MemoryRouter>
    </SettingsProvider>,
  )
}

const LIVE_ROW = {
  id: 'sess-1', code: 'ABC123', status: 'live', setlist_id: null,
  items: [{ uid: 'i0', kind: 'song', slug: 'abba', title: 'Abba', defaultKey: 'Am' }],
  current_item_uid: 'i0', transpose: 0, current_key: 'Am',
}

describe('SessionViewer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the leader’s current song lyrics (lyrics-only) for a live session', async () => {
    sessionMock.row = {
      id: 'sess-1', code: 'ABC123', status: 'live', setlist_id: null,
      items: [{ uid: 'i0', kind: 'song', slug: 'abba', title: 'Abba', defaultKey: 'Am' }],
      current_item_uid: 'i0', transpose: 0, current_key: 'Am',
    }
    renderAt()
    expect(await screen.findByText('Father we love You')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
    // Lyrics-only: no key/transpose display.
    expect(screen.queryByText(/Key:/)).not.toBeInTheDocument()
  })

  it('shows the leader’s key on the chord tier (chord_code join)', async () => {
    sessionMock.row = {
      id: 'sess-1', code: 'ABC123', chord_code: 'CHORD1', tier: 'chord', status: 'live', setlist_id: null,
      items: [{ uid: 'i0', kind: 'song', slug: 'abba', title: 'Abba', defaultKey: 'Am' }],
      current_item_uid: 'i0', transpose: 2, current_key: 'B',
    }
    renderAt('CHORD1')
    expect(await screen.findByText('Father we love You')).toBeInTheDocument()
    expect(screen.getByText(/Key:\s*B/)).toBeInTheDocument()
  })

  it('renders a Bible verse item identically (fetched anonymously)', async () => {
    sessionMock.row = {
      id: 'sess-1', code: 'ABC123', tier: 'lyric', status: 'live', setlist_id: null,
      items: [{ uid: 'i0', kind: 'verse', ref: 'v:esv|John 3:16', title: 'John 3:16' }],
      current_item_uid: 'i0', transpose: 0, current_key: null,
    }
    renderAt()
    expect(await screen.findByText(/For God so loved the world/i)).toBeInTheDocument()
  })

  it('shows the gentle end screen when the session has ended', async () => {
    sessionMock.row = {
      id: 'sess-1', code: 'ABC123', status: 'ended', setlist_id: null,
      items: [{ uid: 'i0', kind: 'song', slug: 'abba', title: 'Abba', defaultKey: 'Am' }],
      current_item_uid: 'i0', transpose: 0, current_key: null,
    }
    renderAt()
    expect(await screen.findByText(/Thanks for joining our session/i)).toBeInTheDocument()
  })

  it('shows a placeholder for non-catalog (personal/verse) items', async () => {
    sessionMock.row = {
      id: 'sess-1', code: 'ABC123', status: 'live', setlist_id: null,
      items: [{ uid: 'i0', kind: 'unavailable', title: 'My Draft', reason: 'personal' }],
      current_item_uid: 'i0', transpose: 0, current_key: null,
    }
    renderAt()
    expect(await screen.findByText(/Not available in this view/i)).toBeInTheDocument()
  })

  it('shows a not-found screen for an unknown code', async () => {
    sessionMock.row = null
    renderAt('NOPE99')
    expect(await screen.findByText(/Session not found/i)).toBeInTheDocument()
  })

  it('toggles light/dark from the header', async () => {
    sessionMock.row = LIVE_ROW
    document.documentElement.setAttribute('data-theme', 'light')
    renderAt()
    await screen.findByText('Father we love You')

    fireEvent.click(screen.getByLabelText('Switch to dark mode'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    fireEvent.click(screen.getByLabelText('Switch to light mode'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('steps the lyric font size and remembers it', async () => {
    sessionMock.row = LIVE_ROW
    renderAt()
    const lyric = await screen.findByText('Father we love You')
    // The size lives on the content wrapper; the lines inherit it.
    const sizedAncestor = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const size = n.style?.fontSize
        if (size && size !== 'inherit') return n
      }
      return null
    }
    expect(sizedAncestor(lyric).style.fontSize).toBe('20px')

    fireEvent.click(screen.getByLabelText('Larger text'))
    expect(sizedAncestor(await screen.findByText('Father we love You')).style.fontSize).toBe('22px')
    expect(localStorage.getItem('gracechords.session.fontPx')).toBe('22')

    fireEvent.click(screen.getByLabelText('Smaller text'))
    expect(sizedAncestor(await screen.findByText('Father we love You')).style.fontSize).toBe('20px')
    expect(localStorage.getItem('gracechords.session.fontPx')).toBe('20')
  })
})
