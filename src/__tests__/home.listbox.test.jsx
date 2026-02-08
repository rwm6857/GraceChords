import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import HomeDashboard from '../pages/HomeDashboard.jsx'

vi.mock('../data/index.json', () => ({
  default: {
    items: [
      { id: 'alpha', title: 'Alpha Song', tags: [], authors: [] },
      { id: 'alabaster', title: 'Alabaster Praise', tags: [], authors: [] }
    ]
  }
}))

vi.mock('../data/resources.json', () => ({
  default: { items: [] }
}))

describe('Home search accessibility', () => {
  beforeEach(() => {
    window.requestIdleCallback = (cb) => { cb(); return 0 }
    window.cancelIdleCallback = () => {}
  })

  test('results listbox navigable with arrows', async () => {
    render(
      <HelmetProvider>
        <HashRouter>
          <HomeDashboard />
        </HashRouter>
      </HelmetProvider>
    )

    const user = userEvent.setup()
    const search = await screen.findByLabelText(/search worship songs/i)
    await user.click(search)
    await user.type(search, 'Al')
    const listbox = await screen.findByRole('listbox')
    expect(listbox).toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    let options = screen.getAllByRole('option')
    expect(search).toHaveAttribute('aria-activedescendant', 'home-sugg-0')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    options = screen.getAllByRole('option')
    expect(search).toHaveAttribute('aria-activedescendant', 'home-sugg-1')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}')
    options = screen.getAllByRole('option')
    expect(search).toHaveAttribute('aria-activedescendant', 'home-sugg-0')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })
})
