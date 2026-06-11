import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { beforeEach, describe, expect, test, vi } from 'vitest'

// Song data comes from Supabase via useSongs(), not the deprecated
// src/data/index.json. Mock the hook to supply the search corpus.
const songMock = vi.hoisted(() => ({
  songs: [
    { dbId: 's1', id: 'alpha', songId: 'alpha', title: 'Alpha Song', language: 'en', originalKey: 'C', tags: [], authors: [], chordpro_content: 'title: Alpha Song\n' },
    { dbId: 's2', id: 'alabaster', songId: 'alabaster', title: 'Alabaster Praise', language: 'en', originalKey: 'C', tags: [], authors: [], chordpro_content: 'title: Alabaster Praise\n' },
  ],
}))

vi.mock('../hooks/useSongs', () => ({
  useSongs: () => ({ songs: songMock.songs, loading: false }),
}))

import HomeDashboard from '../pages/HomeDashboardPage.jsx'

describe('Home search accessibility', () => {
  beforeEach(() => {
    window.requestIdleCallback = (cb) => { cb(); return 0 }
    window.cancelIdleCallback = () => {}
  })

  test('results listbox navigable with arrows', async () => {
    render(
      <HelmetProvider>
        <HashRouter>
          <HomeDashboard />
        </HashRouter>
      </HelmetProvider>
    )

    const user = userEvent.setup()
    const search = await screen.findByLabelText(/search worship songs/i)
    await user.click(search)
    await user.type(search, 'Al')
    const listbox = await screen.findByRole('listbox')
    expect(listbox).toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    let options = screen.getAllByRole('option')
    expect(search).toHaveAttribute('aria-activedescendant', 'home-sugg-0')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    options = screen.getAllByRole('option')
    expect(search).toHaveAttribute('aria-activedescendant', 'home-sugg-1')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}')
    options = screen.getAllByRole('option')
    expect(search).toHaveAttribute('aria-activedescendant', 'home-sugg-0')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })
})
