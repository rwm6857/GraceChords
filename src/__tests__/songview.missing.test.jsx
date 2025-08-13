import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, test, expect, vi, afterEach } from 'vitest'

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }))
import { showToast } from '../utils/toast'
import SongView from '../components/SongView.jsx'

describe('SongView missing file', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('shows error and toast when song file missing', async () => {
    vi.stubGlobal('fetch', (url) => {
      if (String(url).includes('abba.chordpro')) {
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', text: () => Promise.resolve('') })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('') })
    })

    render(
      <MemoryRouter initialEntries={['/song/abba']}>
        <Routes>
          <Route path="/song/:id" element={<SongView />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByText('Error: Song file not found: abba.chordpro')
    expect(showToast).toHaveBeenCalledWith('Failed to load abba.chordpro')
  })
})
