import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

// The admin Setlist Stats page over a fake get_song_stats_admin() RPC: the
// sections, suppressed figures shown as a dash, and the not-set-up state.

let rpcResult
const rpc = vi.fn(async () => rpcResult)
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const REPORT = {
  generated_at: '2026-11-06T12:00:00Z',
  min_users: 5,
  coverage: { library_songs: 216, sung_90d: 40, sung_90d_pct: 18.5, sung_or_opened_90d: null, sung_or_opened_90d_pct: null },
  most_sung: [
    { rank: 1, title: 'Goodness of God', removed_from_library: false, plays: 120, sets: 60, reach: 12, last_played: '2026-11-02T15:00:00Z' },
    { rank: null, title: 'Old Hymn', removed_from_library: true, plays: null, sets: null, reach: null, last_played: null },
  ],
  most_opened: [],
  never_sung: [{ title: 'Quiet Song', created_at: '2026-01-01T00:00:00Z' }],
  never_sung_or_opened: [],
  weekly: [{ period_start: '2026-11-02', active_users: 9, sets: 14 }],
  monthly: [{ period_start: '2026-11-01', active_users: 11, sets: 30, mean_sets: 2.73, median_sets: 2 }],
  set_lengths: [{ songs_per_set: 5, sets: 20, users: 8 }],
  depth: [{ lifetime_sets: '1', users: null }, { lifetime_sets: '2–5', users: 6 }],
  feature_totals: [{ feature: 'pitch_pipe', uses: 42, first_day: '2026-11-01', last_day: '2026-11-06' }],
  feature_monthly: [],
}

async function renderPage() {
  const { default: AdminStatsPage } = await import('../AdminStatsPage')
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <AdminStatsPage />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

function section(name) {
  return screen.getByRole('heading', { level: 2, name }).closest('section')
}

describe('AdminStatsPage', () => {
  beforeEach(() => {
    rpc.mockClear()
    rpcResult = { data: REPORT, error: null }
  })

  it('loads the report from the admin RPC and lays out each section', async () => {
    await renderPage()
    expect(await screen.findByRole('heading', { name: 'Most sung' })).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('get_song_stats_admin')

    const library = section('Library, last 90 days')
    expect(within(library).getByText('216')).toBeInTheDocument()
    expect(within(library).getByText('Never sung: 1')).toBeInTheDocument()

    const sung = section('Most sung')
    expect(within(sung).getByText('Goodness of God')).toBeInTheDocument()
    expect(within(sung).getByText('120')).toBeInTheDocument()
    expect(within(sung).getByText('Old Hymn (removed)')).toBeInTheDocument()

    expect(within(section('Most opened')).getByText('Nothing yet.')).toBeInTheDocument()
    expect(within(section('Features')).getByText('Pitch pipe')).toBeInTheDocument()
  })

  it('shows a suppressed figure as a dash, never a zero', async () => {
    await renderPage()
    await screen.findByRole('heading', { name: 'Library, last 90 days' })
    const library = section('Library, last 90 days')
    const tile = within(library).getByText('Sung or opened').parentElement
    expect(tile).toHaveTextContent('—')
    const oldHymn = within(section('Most sung')).getByText('Old Hymn (removed)').closest('tr')
    expect(within(oldHymn).getAllByText('—')).toHaveLength(4)
  })

  it('switches the people table between weeks and months', async () => {
    await renderPage()
    await screen.findByRole('heading', { name: 'People running sets' })
    const people = section('People running sets')
    expect(within(people).getByRole('columnheader', { name: 'Week of' })).toBeInTheDocument()
    await userEvent.click(within(people).getByRole('radio', { name: 'By month' }))
    expect(within(people).getByRole('columnheader', { name: 'Median' })).toBeInTheDocument()
    expect(within(people).getByText('2.73')).toBeInTheDocument()
  })

  it('says how to set it up when the function is missing', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await renderPage()
    expect(await screen.findByRole('heading', { name: 'Not set up yet' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('20261106200000_song_stats_admin_dashboard.sql')
  })

  it('shows the server message for any other error, such as a non-admin', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'Admins only' } }
    await renderPage()
    expect(await screen.findByRole('heading', { name: 'Couldn’t load the stats' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Admins only')
  })
})
