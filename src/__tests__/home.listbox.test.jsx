import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import Home from '../components/Home.jsx'

describe('Home search accessibility', () => {
  test('results listbox navigable with arrows', async () => {
    render(
      <HashRouter>
        <Home />
      </HashRouter>
    )

    const user = userEvent.setup()
    const search = await screen.findByLabelText(/search/i)
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()

    await user.click(search)
    await user.keyboard('{ArrowDown}')
    const options = screen.getAllByRole('option')
    const first = options[0]
    expect(first).toHaveFocus()
    expect(first).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    const second = screen.getAllByRole('option')[1]
    expect(second).toHaveFocus()
    expect(second).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}')
    expect(first).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(search).toHaveFocus()
  })
})
