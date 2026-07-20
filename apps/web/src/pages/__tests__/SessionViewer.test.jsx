import React from 'react'
import { describe, it, beforeEach, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  })

  it('renders the leader’s current song lyrics for a live session', async () => {
    sessionMock.row = {
      id: 'sess-1', code: 'ABC123', status: 'live', setlist_id: null,
      items: [{ uid: 'i0', kind: 'song', slug: 'abba', title: 'Abba', defaultKey: 'Am' }],
      current_item_uid: 'i0', transpose: 0, current_key: 'Am',
    }
    renderAt()
    expect(await screen.findByText('Father we love You')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
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
