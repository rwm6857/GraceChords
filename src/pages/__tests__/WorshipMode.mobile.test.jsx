import React from 'react'
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import WorshipMode from '../WorshipModePage'

const SONGS = {
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
    if (hit) return { ok: true, text: async () => hit.content }
    return { ok: false, text: async () => '' }
  }
  return () => { global.fetch = orig }
}

function setViewport(width){
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

describe('WorshipMode — mobile toolbar and snackbar', () => {
  let restore
  beforeEach(() => {
    restore = mockFetch()
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => { restore?.() })

  it('uses icon-only toolbar and moves secondary controls to More on mobile', async () => {
    setViewport(375)
    render(
      <MemoryRouter initialEntries={[`/worship/abba,above-all`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Abba')).toBeInTheDocument()
    // No text labels on buttons (e.g., Key Up)
    expect(screen.queryByText(/Key Up/)).toBeNull()
    expect(screen.queryByText(/Reset/)).toBeNull()
    // Hides text-based navigation labels on mobile
    expect(screen.queryByText(/NEXT/)).toBeNull()
    expect(screen.queryByText(/BACK/)).toBeNull()
    // Primary icons remain accessible
    expect(screen.getByRole('button', { name: /Previous song/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next song/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Raise key/i })).toBeInTheDocument()
    // Secondary control appears in More sheet
    fireEvent.click(screen.getByRole('button', { name: /More controls/i }))
    expect(await screen.findByRole('button', { name: /Toggle chords/i })).toBeInTheDocument()
  })

  it('shows swipe hint once on mobile, and fades out', async () => {
    setViewport(414)
    vi.useFakeTimers()
    render(
      <MemoryRouter initialEntries={[`/worship/abba`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    // Flush microtasks for fetch/effects
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(screen.getAllByText('Abba').length).toBeGreaterThan(0)
    // Snackbar appears
    expect(screen.getByText(/Swipe left\/right for songs/i)).toBeInTheDocument()
    // Advance timers ~3s to auto-dismiss
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText(/Swipe left\/right for songs/i)).toBeNull()
    // Re-render should not show again because of localStorage flag
    vi.useRealTimers()
    render(
      <MemoryRouter initialEntries={[`/worship/abba`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    await act(async () => { await Promise.resolve() })
    expect(screen.getAllByText('Abba').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Swipe left\/right for songs/i)).toBeNull()
  })

  it('ignores downward swipe from top edge to avoid refresh gesture collisions', async () => {
    setViewport(390)
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
    const viewport = document.querySelector('.worship__viewport')
    expect(viewport).toBeTruthy()

    fireEvent.touchStart(viewport, {
      changedTouches: [{ clientX: 140, clientY: 20 }],
    })
    fireEvent.touchEnd(viewport, {
      changedTouches: [{ clientX: 140, clientY: 200 }],
    })

    expect(screen.getByText(/Key:/).textContent).toEqual(initial)
  })

  it('hides column selector on mobile settings and toggles clock/timer from More sheet', async () => {
    setViewport(390)
    render(
      <MemoryRouter initialEntries={[`/worship/abba`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Abba')).toBeInTheDocument()
    expect(screen.queryByLabelText('Clock')).toBeNull()
    expect(screen.queryByLabelText('Stopwatch')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /More controls/i }))
    expect(await screen.findByRole('button', { name: /Toggle clock/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Toggle timer/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Toggle clock/i }))
    fireEvent.click(screen.getByRole('button', { name: /Toggle timer/i }))
    fireEvent.click(screen.getByRole('button', { name: /Done/i }))
    expect(screen.getByLabelText('Clock')).toBeInTheDocument()
    expect(screen.getByLabelText('Stopwatch')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Open settings/i }))
    expect(await screen.findByRole('checkbox', { name: /Show clock/i })).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: /Show timer/i })).toBeInTheDocument()
    expect(screen.queryByText('Columns')).toBeNull()
  })

  it('shows full toolbar and NEXT on desktop', async () => {
    setViewport(1024)
    render(
      <MemoryRouter initialEntries={[`/worship/abba,above-all`]}>
        <Routes>
          <Route path="/worship/:songIds" element={<WorshipMode />} />
        </Routes>
      </MemoryRouter>
    )
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(screen.getAllByText('Abba').length).toBeGreaterThan(0)
    // Text labels visible on desktop
    expect(screen.getByText(/Key Up/)).toBeInTheDocument()
    // NEXT visible (BACK hidden at index 0)
    expect(screen.getByText(/NEXT/)).toBeInTheDocument()
  })
})
