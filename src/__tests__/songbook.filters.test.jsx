import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Songbook from '../components/Songbook.jsx'

describe('Songbook filters', () => {
  test('filters songs by selected author present in index', async () => {
    render(<Songbook />)
    const authorSelect = await screen.findByLabelText(/author/i)

    await userEvent.selectOptions(authorSelect, 'Matt Redman')
    // Present in current index.json under Matt Redman
    expect(await screen.findByText('10,000 Reasons')).toBeInTheDocument()
    expect(await screen.findByText('Heart of Worship')).toBeInTheDocument()
    // Ensure unrelated title is not included when filtering
    expect(screen.queryByText('Abba')).not.toBeInTheDocument()

    // Switch to a different available author in the data (e.g., Chris Tomlin)
    await userEvent.selectOptions(authorSelect, 'Chris Tomlin')
    expect(await screen.findByText('Holy Forever')).toBeInTheDocument()
    expect(screen.queryByText('10,000 Reasons')).not.toBeInTheDocument()
  })
})
