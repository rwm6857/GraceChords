import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SongView from '../pages/SongViewPage.jsx'
import { clearHeadCache } from '../utils/network/headCache.js'

function setViewport(width){
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

function mockFetch(hasPptx) {
  const chordpro = '{title:Abba}\n{youtube: https://youtu.be/abcdefghijk}\n[C]Line'
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

describe('SongView mobile dock', () => {
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

  test('shows compact mobile actions with More sheet', async () => {
    setViewport(390)
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

    expect(await screen.findByRole('heading', { name: /abba/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /toggle chords/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    expect(await screen.findByRole('dialog', { name: /song actions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JPG' })).toBeInTheDocument()
  })
})
