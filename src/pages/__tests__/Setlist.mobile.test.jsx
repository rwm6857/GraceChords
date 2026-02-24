import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Setlist from '../SetlistPage'

function setViewport(width){
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

describe('Setlist mobile layout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps primary actions visible and opens More sheet', async () => {
    setViewport(390)
    render(
      <MemoryRouter initialEntries={['/setlist']}>
        <Setlist />
      </MemoryRouter>
    )

    expect(await screen.findByText('Setlist Builder')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Worship/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /More actions/i }))
    expect(await screen.findByRole('dialog', { name: /Setlist actions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument()
  })

  it('switches between add and current panes with mobile tabs', async () => {
    setViewport(390)
    render(
      <MemoryRouter initialEntries={['/setlist']}>
        <Setlist />
      </MemoryRouter>
    )

    expect(await screen.findByRole('radio', { name: /Add songs/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Verse/i })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /Current/i }))
    expect(await screen.findByRole('button', { name: /Add Verse/i })).toBeInTheDocument()
  })
})
