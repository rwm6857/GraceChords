import { render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import App from '../App.jsx'

describe('Routing smoke', () => {
  test('home renders', async () => {
    render(
      <HashRouter>
        <App />
      </HashRouter>
    )
    // Query by the associated <label for="search">Search</label>
	expect(await screen.findByLabelText(/search/i)).toBeInTheDocument()
  })

  test('setlist route renders', async () => {
    window.location.hash = '#/setlist'
    render(
      <HashRouter>
        <App />
      </HashRouter>
    )
    // Button text is "Export PDF" in UI
    expect(await screen.findByRole('button', { name: /export pdf/i })).toBeInTheDocument()
  })

  test('admin route renders (with gate present)', async () => {
    window.location.hash = '#/admin'
    render(
      <HashRouter>
        <App />
      </HashRouter>
    )
    // Gate uses a placeholder instead of a label
    expect(await screen.findByPlaceholderText(/password/i)).toBeInTheDocument()
  })
})