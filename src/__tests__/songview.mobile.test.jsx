import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const songMock = vi.hoisted(() => ({
  songs: [
    {
      dbId: 'song-1',
      id: 'abba',
      title: 'Abba',
      originalKey: 'C',
      tags: [],
      authors: [],
      filename: 'abba.chordpro',
      chordpro_content: '{title:Abba}\n{youtube: https://youtu.be/abcdefghijk}\n[C]Line',
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

describe('SongView mobile dock', () => {
  beforeEach(() => {
    // No PPTX available; HEAD checks resolve to not-found.
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false }))
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

  test('renders icon-only Download/Worship actions and opens the download sheet', async () => {
    setViewport(390)

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/song/abba']}>
          <Routes>
            <Route path="/song/:id" element={<SongView />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )

    expect(await screen.findByRole('heading', { name: /abba/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /toggle chords/i })).toBeInTheDocument()

    // Download/Worship are icon-only on mobile but keep accessible names.
    const downloadBtn = screen.getByRole('button', { name: 'Download' })
    const worshipLink = screen.getByRole('link', { name: 'Worship Mode' })
    expect(downloadBtn).toBeInTheDocument()
    expect(downloadBtn).toHaveClass('gc-btn--iconOnly')
    expect(worshipLink).toBeInTheDocument()
    expect(worshipLink).toHaveClass('gc-btn--iconOnly')

    fireEvent.click(downloadBtn)
    expect(await screen.findByRole('dialog', { name: /download/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JPG' })).toBeInTheDocument()
  })
})
