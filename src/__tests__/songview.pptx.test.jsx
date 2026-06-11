import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const songMock = vi.hoisted(() => ({
  songs: [
    {
      dbId: 'song-1',
      id: 'abba',
      title: 'Test',
      originalKey: 'C',
      tags: [],
      authors: [],
      filename: 'abba.chordpro',
      chordpro_content: '{title:Test}\n{youtube: https://youtu.be/abcdefghijk}\n[C]Line',
    },
  ],
}))

vi.mock('../hooks/useSongs', () => ({
  useSongs: () => ({ songs: songMock.songs, loading: false }),
}))

import SongView from '../pages/SongViewPage.jsx'
import { clearHeadCache } from '../utils/network/headCache.js'

function setViewport(width){
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

function mockFetch(hasPptx) {
  vi.stubGlobal('fetch', (url) => {
    if (String(url).includes('.pptx')) {
      return Promise.resolve({ ok: hasPptx })
    }
    return Promise.resolve({ ok: true, text: () => Promise.resolve('') })
  })
}

describe('SongView PPTX button', () => {
  beforeEach(() => {
    setViewport(390)
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
    await screen.findByRole('heading', { name: /test/i })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(await screen.findByRole('button', { name: /download pptx/i })).toBeInTheDocument()
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
    await screen.findByRole('heading', { name: /test/i })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await screen.findByRole('dialog', { name: /download/i })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /download pptx/i })).toBeNull()
    })
  })
})
