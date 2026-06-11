import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { describe, test, expect, vi, afterEach } from 'vitest'

// Song data now comes from useSongs (Supabase), not a static file fetch.
// An unknown id resolves to no catalog entry, so SongView renders "Song not found".
vi.mock('../hooks/useSongs', () => ({
  useSongs: () => ({ songs: [], loading: false }),
}))

import SongView from '../pages/SongViewPage.jsx'

describe('SongView missing song', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('shows "Song not found" when the id is not in the catalog', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/song/abba']}>
          <Routes>
            <Route path="/song/:id" element={<SongView />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )

    expect(await screen.findByText(/song not found/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument()
  })
})
