import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// Song data comes from Supabase via useSongs(), not the deprecated
// src/data/index.json. Mock the hook to supply the searchable corpus.
const songMock = vi.hoisted(() => ({
  songs: [
    { dbId: 's1', id: '10000-reasons', songId: '10000-reasons', title: '10,000 Reasons', language: 'en', originalKey: 'C', tags: [], authors: ['Matt Redman'], chordpro_content: 'title: 10,000 Reasons\n' },
    { dbId: 's2', id: 'heart-of-worship', songId: 'heart-of-worship', title: 'Heart of Worship', language: 'en', originalKey: 'C', tags: [], authors: ['Matt Redman'], chordpro_content: 'title: Heart of Worship\n' },
    { dbId: 's3', id: 'holy-forever', songId: 'holy-forever', title: 'Holy Forever', language: 'en', originalKey: 'C', tags: [], authors: ['Chris Tomlin'], chordpro_content: 'title: Holy Forever\n' },
    { dbId: 's4', id: 'abba', songId: 'abba', title: 'Abba', language: 'en', originalKey: 'Am', tags: [], authors: ['Other Writer'], chordpro_content: 'title: Abba\n' },
  ],
}))

vi.mock('../hooks/useSongs', () => ({
  useSongs: () => ({ songs: songMock.songs, loading: false }),
}))

import Songbook from '../pages/SongbookPage.jsx'

function setViewport(width){
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

describe('Songbook filters', () => {
  test('filters songs by selected author present in index', async () => {
    setViewport(1024)
    render(
      <MemoryRouter initialEntries={['/songbook']}>
        <Songbook />
      </MemoryRouter>
    )
    const searchInput = await screen.findByPlaceholderText(/search/i)

    await userEvent.type(searchInput, 'Redman')
    expect(await screen.findByText('10,000 Reasons')).toBeInTheDocument()
    expect(await screen.findByText('Heart of Worship')).toBeInTheDocument()
    expect(screen.queryByText('Abba')).not.toBeInTheDocument()

    await userEvent.clear(searchInput)
    await userEvent.type(searchInput, 'Tomlin')
    expect(await screen.findByText('Holy Forever')).toBeInTheDocument()
    expect(screen.queryByText('10,000 Reasons')).not.toBeInTheDocument()
  })

  test('uses mobile tabs to switch between add and current panes', async () => {
    localStorage.clear()
    setViewport(390)
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/songbook']}>
        <Songbook />
      </MemoryRouter>
    )

    expect(await screen.findByRole('radio', { name: /Add songs/i })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Selected songs/i })).toBeNull()
    await user.click(screen.getByRole('radio', { name: /Current/i }))
    expect(await screen.findByRole('region', { name: /Selected songs/i })).toBeInTheDocument()
  })
})
