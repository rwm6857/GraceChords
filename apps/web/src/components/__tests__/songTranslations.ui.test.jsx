import React from 'react'
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

// Song data (including chordpro_content and the translation grouping fields)
// comes from Supabase via useSongs(), not the deprecated src/data/index.json
// + per-song fetch('/songs/*.chordpro'). Mock the hook with both language
// variants of the "send-us-lord" group plus an English-only song.
const songMock = vi.hoisted(() => ({
  songs: [
    {
      dbId: 't1', id: 'send-us-lord-en', songId: 'send-us-lord', language: 'en',
      title: 'Send Us Lord', originalKey: 'A', tags: ['Missions'], authors: ['Test Team'],
      incomplete: false,
      chordpro_content: '{title: Send Us Lord}\n{key: A}\n{sov Verse}\n[A]Send us [D]Lord\n{eov}\n',
    },
    {
      dbId: 't2', id: 'send-us-lord-tr', songId: 'send-us-lord', language: 'tr',
      title: 'Rab Bizi Gönder', originalKey: 'A', tags: ['Missions'], authors: ['Test Team'],
      incomplete: false,
      chordpro_content: '{title: Rab Bizi Gönder}\n{key: A}\n{sov Verse}\n[A]Rab bizi [D]gönder\n[A]ıüşiçöğ [D]IÜŞİÇÖĞ\n{eov}\n',
    },
    {
      dbId: 't3', id: 'only-en', songId: 'only-english', language: 'en',
      title: 'Only English', originalKey: 'C', tags: ['Test'], authors: ['Test Team'],
      incomplete: false,
      chordpro_content: '{title: Only English}\n{key: C}\n{sov Verse}\n[C]Only [F]English\n{eov}\n',
    },
  ],
}))

vi.mock('../../hooks/useSongs', () => ({
  useSongs: () => ({ songs: songMock.songs, loading: false }),
}))

import Songs from '../../pages/SongsPage'
import SongView from '../../pages/SongViewPage'

// SongView still issues HEAD/asset fetches (e.g. pptx availability). Resolve
// them all to not-found so they don't interfere with the rendered content.
function mockFetch() {
  const originalFetch = global.fetch
  global.fetch = vi.fn(async () => ({ ok: false, text: async () => '' }))
  return () => {
    global.fetch = originalFetch
  }
}

describe('translation linking UI behavior', () => {
  let restoreFetch
  let restoreGetContext

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('pref:songLanguage', 'tr')
    restoreFetch = mockFetch()
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      font: '',
      measureText: (txt) => ({ width: String(txt || '').length * 8 }),
      save: () => {},
      restore: () => {},
    }))
    restoreGetContext = () => {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })

  afterEach(() => {
    restoreGetContext?.()
    restoreFetch?.()
    vi.restoreAllMocks()
  })

  it('shows translated card title and links to translated id in Songs list', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/songs']}>
          <Routes>
            <Route path="/songs" element={<Songs />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )

    expect(await screen.findByText('Rab Bizi Gönder')).toBeInTheDocument()
    expect(screen.getByText('No Translation in Selected Language')).toBeInTheDocument()

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Rab Bizi Gönder')
    expect(options[1]).toHaveTextContent('Only English')

    const translatedLink = screen.getByText('Rab Bizi Gönder').closest('a')
    const fallbackLink = screen.getByText('Only English').closest('a')
    expect(translatedLink?.getAttribute('href')).toBe('/song/send-us-lord-tr')
    expect(fallbackLink?.getAttribute('href')).toBe('/song/only-en')
  })

  it('switches to linked translation id in SongView when language chip is clicked', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/song/send-us-lord-en']}>
          <Routes>
            <Route path="/song/:id" element={<SongView />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )

    expect(await screen.findByText('Send Us Lord')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'TR' }))

    expect(await screen.findByText('Rab Bizi Gönder')).toBeInTheDocument()
    // The chord sheet renders chord-over-lyric, so each syllable lands in its
    // own cell — assert the Turkish lyrics (with their locale-specific glyphs)
    // are present in the rendered sheet rather than as one contiguous node.
    const sheet = document.querySelector('.songpage__sheet')
    expect(sheet).toBeTruthy()
    expect(sheet.textContent).toContain('ıüşiçöğ')
    expect(sheet.textContent).toContain('IÜŞİÇÖĞ')
    await waitFor(() => {
      expect(localStorage.getItem('pref:songLanguage')).toBe('tr')
    })
  })
})
