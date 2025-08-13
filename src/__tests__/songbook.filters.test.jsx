import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Songbook from '../components/Songbook.jsx'

describe('Songbook filters', () => {
  test('filters multi-author songs by each author', async () => {
    render(<Songbook />)
    const authorSelect = await screen.findByLabelText(/author/i)

    await userEvent.selectOptions(authorSelect, 'Matt Redman')
    expect(await screen.findByText('Blessed Be Your Name')).toBeInTheDocument()
    expect(await screen.findByText('Build My Life')).toBeInTheDocument()
    expect(screen.queryByText('Abba')).not.toBeInTheDocument()

    await userEvent.selectOptions(authorSelect, 'Brett Younker')
    expect(await screen.findByText('Build My Life')).toBeInTheDocument()
    expect(screen.queryByText('Blessed Be Your Name')).not.toBeInTheDocument()
  })
})
