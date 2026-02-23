import React from 'react'
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

vi.mock('../../data/index.json', () => ({
  default: {
    items: [
      {
        id: 'send-us-lord-en',
        songId: 'send-us-lord',
        language: 'en',
        title: 'Send Us Lord',
        filename: 'translation_demo_send_us_lord_en.chordpro',
        originalKey: 'A',
        tags: ['Missions'],
        authors: ['Test Team'],
        incomplete: false,
      },
      {
        id: 'send-us-lord-tr',
        songId: 'send-us-lord',
        language: 'tr',
        title: 'Rab Bizi Gönder',
        filename: 'translation_demo_send_us_lord_tr.chordpro',
        originalKey: 'A',
        tags: ['Missions'],
        authors: ['Test Team'],
        incomplete: false,
      },
      {
        id: 'only-en',
        songId: 'only-english',
        language: 'en',
        title: 'Only English',
        filename: 'only_english.chordpro',
        originalKey: 'C',
        tags: ['Test'],
        authors: ['Test Team'],
        incomplete: false,
      },
    ],
  },
}))

import Songs from '../../pages/SongsPage'
import SongView from '../../pages/SongViewPage'

const SONG_TEXT = {
  'translation_demo_send_us_lord_en.chordpro': `{title: Send Us Lord}
{key: A}
{sov Verse}
[A]Send us [D]Lord
{eov}
`,
  'translation_demo_send_us_lord_tr.chordpro': `{title: Rab Bizi Gönder}
{key: A}
{sov Verse}
[A]Rab bizi [D]gönder
[A]ıüşiçöğ [D]IÜŞİÇÖĞ
{eov}
`,
  'only_english.chordpro': `{title: Only English}
{key: C}
{sov Verse}
[C]Only [F]English
{eov}
`,
}

function mockFetch() {
  const originalFetch = global.fetch
  global.fetch = vi.fn(async (url, options = {}) => {
    const u = String(url)
    if (String(options?.method || '').toUpperCase() === 'HEAD') {
      return { ok: false, text: async () => '' }
    }
    const hit = Object.entries(SONG_TEXT).find(([filename]) =>
      u.includes(`/songs/${filename}`)
    )
    if (hit) {
      return { ok: true, text: async () => hit[1] }
    }
    return { ok: false, text: async () => '' }
  })
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
    expect(screen.getByText('ıüşiçöğ IÜŞİÇÖĞ')).toBeInTheDocument()
    await waitFor(() => {
      expect(localStorage.getItem('pref:songLanguage')).toBe('tr')
    })
  })
})
