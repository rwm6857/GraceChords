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
}))

// Platform detection drives the mobile-only "open in app" banner. Toggle per test.
const platformMock = vi.hoisted(() => ({ mobile: false }))
vi.mock('../../utils/app/platform', () => ({
  isMobile: () => platformMock.mobile,
  isIOS: () => platformMock.mobile,
  isAndroid: () => false,
}))

import SessionViewer from '../SessionViewerPage'

function renderAt(code = 'ABC123') {
  return render(
    <MemoryRouter initialEntries={[`/s/${code}`]}>
      <Routes>
        <Route path="/s/:code" element={<SessionViewer />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SessionViewer', () => {
  beforeEach(() => {
    localStorage.clear()
    platformMock.mobile = false
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

  it('shows a dismissible open-in-app banner on mobile only', async () => {
    platformMock.mobile = true
    sessionMock.row = {
      id: 'sess-1', code: 'ABC123', status: 'live', setlist_id: null,
      items: [{ uid: 'i0', kind: 'song', slug: 'abba', title: 'Abba', defaultKey: 'Am' }],
      current_item_uid: 'i0', transpose: 0, current_key: 'Am',
    }
    renderAt()
    const openBtn = await screen.findByRole('button', { name: /Open in app/i })
    expect(openBtn).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))
    expect(screen.queryByRole('button', { name: /Open in app/i })).not.toBeInTheDocument()
    expect(localStorage.getItem('session:appBannerDismissed')).toBe('1')
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
})
