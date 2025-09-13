import React from 'react'
import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import WorshipMode from '../WorshipMode'

const SONGS = {
  // id -> { filename, content }
  abba: {
    filename: 'abba.chordpro',
    content: `title: Abba\nkey: Am\n[Verse]\nFather we love You\n`,
  },
  'above-all': {
    filename: 'above_all.chordpro',
    content: `title: Above All\nkey: A\n[Verse]\nAbove all powers\n`,
  },
}

function mockFetch(){
  const orig = global.fetch
  global.fetch = async (url) => {
    const u = String(url)
    const hit = Object.values(SONGS).find(s => u.includes(`/songs/${s.filename}`))
    if (hit) {
      return new Response(new Blob([hit.content], { type: 'text/plain' }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }
  return () => { global.fetch = orig }
}

describe('WorshipMode', () => {
  let restore
  beforeEach(() => {
    restore = mockFetch()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })
  afterEach(() => {
    restore?.()
  })

  it('loads a single song', async () => {
    render(
      <MemoryRouter initialEntries={[`/worship/abba`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Abba')).toBeInTheDocument()
    expect(screen.getByText(/Key:/)).toHaveTextContent('Key: Am')
  })

  it('advances to next song via NEXT button', async () => {
    render(
      <MemoryRouter initialEntries={[`/worship/abba,above-all`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Abba')).toBeInTheDocument()
    const nextBtn = await screen.findByRole('button', { name: /NEXT/ })
    await act(async () => { fireEvent.click(nextBtn) })
    expect(await screen.findByText('Above All')).toBeInTheDocument()
  })

  it('transposes key up by one semitone', async () => {
    render(
      <MemoryRouter initialEntries={[`/worship/abba`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Abba')).toBeInTheDocument()
    const keyLine = screen.getByText(/Key:/)
    const initial = keyLine.textContent
    const btn = screen.getByRole('button', { name: /Key Up/ })
    fireEvent.click(btn)
    // should now be different than initial
    expect(screen.getByText(/Key:/).textContent).not.toEqual(initial)
  })

  it('theme toggle persists to localStorage and updates attribute', async () => {
    render(
      <MemoryRouter initialEntries={[`/worship/abba`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Abba')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Theme/ })
    const before = document.documentElement.getAttribute('data-theme') || 'light'
    fireEvent.click(btn)
    const after = document.documentElement.getAttribute('data-theme')
    expect(after && after !== before).toBe(true)
    expect(['light','dark']).toContain(localStorage.getItem('gracechords.theme'))
  })

  it('uses PDF pt window for fit (font size from {16..12})', async () => {
    render(
      <MemoryRouter initialEntries={[`/worship/abba`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    await screen.findByText('Abba')
    const el = document.querySelector('.worship__content')
    const px = parseInt(el?.style?.fontSize || '0', 10)
    expect([16,15,14,13,12]).toContain(px)
  })
})

