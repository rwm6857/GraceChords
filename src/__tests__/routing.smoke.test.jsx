import { render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from '../App.jsx'

describe('Routing smoke', () => {
  test('home renders', async () => {
    render(
      <HelmetProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </HelmetProvider>
    )
    // Query by the associated <label for="search">Search</label>
	expect(await screen.findByLabelText(/search/i)).toBeInTheDocument()
  })

  test('setlist route renders', async () => {
    window.location.hash = '#/setlist'
    render(
      <HelmetProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </HelmetProvider>
    )
    // Button text is "Export PDF" in UI
    expect(await screen.findByRole('button', { name: /export pdf/i })).toBeInTheDocument()
  })

  test('admin route renders (with gate present)', async () => {
    window.location.hash = '#/admin'
    render(
      <HelmetProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </HelmetProvider>
    )
    // Gate uses a placeholder instead of a label
    expect(await screen.findByPlaceholderText(/password/i)).toBeInTheDocument()
  })
})
