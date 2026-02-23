import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SongView from '../pages/SongViewPage.jsx'
import { clearHeadCache } from '../utils/network/headCache.js'

function mockFetch(hasPptx) {
  const chordpro = '{title:Test}\n{youtube: https://youtu.be/abcdefghijk}\n[C]Line'
  vi.stubGlobal('fetch', (url) => {
    if (String(url).includes('.chordpro')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(chordpro) })
    }
    if (String(url).includes('.pptx')) {
      return Promise.resolve({ ok: hasPptx })
    }
    return Promise.resolve({ ok: true, text: () => Promise.resolve('') })
  })
}

describe('SongView PPTX button', () => {
  beforeEach(() => {
    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag, ...args) => {
      if (tag === 'canvas') {
        return { getContext: () => ({ font: '', measureText: () => ({ width: 0 }) }) }
      }
      return orig(tag, ...args)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    clearHeadCache()
  })

  test('shows PPTX download when available', async () => {
    mockFetch(true)
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/song/abba']}>
          <Routes>
            <Route path="/song/:id" element={<SongView />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )
    expect(await screen.findByRole('link', { name: /download pptx/i })).toBeInTheDocument()
  })

  test('hides PPTX download when missing', async () => {
    mockFetch(false)
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/song/abba']}>
          <Routes>
            <Route path="/song/:id" element={<SongView />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )
    // Ensure we are on the song page (title rendered)
    await screen.findByRole('heading', { name: /test/i })
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /download pptx/i })).toBeNull()
    })
  })
})
