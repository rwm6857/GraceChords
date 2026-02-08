import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Songbook from '../components/Songbook.jsx'

describe('Songbook filters', () => {
  test('filters songs by selected author present in index', async () => {
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
})
