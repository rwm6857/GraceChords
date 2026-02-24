import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
