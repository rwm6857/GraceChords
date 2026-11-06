import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

// The Song Stats page over a fake Supabase: the gate, the sections, the
// snapshot-title fallback for a deleted song, and the admin/dev preview.

let rows = []
let titles = []

function builder(table) {
  const b = {}
  for (const m of ['select', 'eq', 'order', 'gte', 'in', 'range', 'maybeSingle']) b[m] = () => b
  b.then = (res, rej) => {
    let data = []
    if (table === 'song_plays') data = rows
    if (table === 'songs') data = titles
    if (table === 'users') data = { preferences: {} }
    return Promise.resolve({ data, error: null }).then(res, rej)
  }
  return b
}

const supabase = { from: (table) => builder(table), rpc: async () => ({ data: null, error: null }) }

vi.mock('../../lib/supabase', () => ({ supabase }))
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    isLoggedIn: true,
    loading: false,
    user: { id: 'user-1' },
    session: { user: { id: 'user-1' } },
    hasMinRole: () => false,
  }),
}))

const DAY = 86_400_000

function setsOf(n, songIds) {
  const out = []
  for (let i = 0; i < n; i++) {
    songIds.forEach((id, entry) =>
      out.push({
        performer_session_id: `set-${i}`,
        entry_index: entry,
        song_id: id,
        song_source: 'catalog',
        song_title: `Snapshot ${id}`,
        played_at: new Date(Date.now() - (i * 7 + 1) * DAY).toISOString(),
        utc_offset_minutes: 0,
      }),
    )
  }
  return out
}

async function renderPage({ bypassGate = false, sample = false } = {}) {
  vi.resetModules()
  localStorage.clear()
  const { songStatsPreview } = await import('../../lib/songStats')
  songStatsPreview.set({ bypassGate, sample })
  const { default: SongStatsPage } = await import('../SongStatsPage')
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <SongStatsPage />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

beforeEach(() => {
  rows = []
  titles = []
})

describe('SongStatsPage', () => {
  it('shows the empty state below 10 sets', async () => {
    rows = setsOf(9, ['a'])
    await renderPage()
    expect(await screen.findByRole('heading', { name: 'Setlist Stats appears after 10 sets' })).toBeTruthy()
    expect(screen.getByText(/You’ve run 9 so far/)).toBeTruthy()
    expect(screen.queryByText('SONGS YOU SANG THE MOST')).toBeNull()
  })

  it('shows the stats at 10 sets, with current titles and the snapshot for a deleted song', async () => {
    rows = setsOf(10, ['live', 'gone'])
    titles = [{ id: 'live', title: 'Current Title' }]
    await renderPage()
    expect(await screen.findByText('SONGS YOU SANG THE MOST')).toBeTruthy()
    // Both songs are in all of the last 8 sets, so they appear under heavy rotation too.
    const mostSung = screen.getByRole('heading', { name: 'SONGS YOU SANG THE MOST' }).closest('section')
    expect(within(mostSung).getByText('Current Title')).toBeTruthy()
    expect(within(mostSung).getByText('Snapshot gone')).toBeTruthy()
    expect(within(mostSung).getAllByText('10 times')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'About Setlist Stats' })).toBeTruthy()
  })

  it('previews below the gate in dev builds and admin accounts', async () => {
    rows = setsOf(3, ['a'])
    await renderPage({ bypassGate: true })
    expect(await screen.findByText('Preview: 3 of 10 sets logged')).toBeTruthy()
    expect(screen.getByText('SONGS YOU SANG THE MOST')).toBeTruthy()
    expect(screen.getByText('PREVIEW')).toBeTruthy()
  })

  it('fills every section from sample data', async () => {
    await renderPage({ sample: true })
    expect(await screen.findByText('Showing sample data')).toBeTruthy()
    for (const heading of ['OVERVIEW', 'SONGS YOU SANG THE MOST', 'NEW TO YOUR SETS', 'IN HEAVY ROTATION', 'NOT SUNG IN A WHILE']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
  })
})
