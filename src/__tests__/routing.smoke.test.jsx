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
    // PDF download button is the primary action in the Setlist toolbar
    expect(await screen.findByRole('button', { name: /download pdf/i })).toBeInTheDocument()
  })

  test('admin route is gated — anonymous users are redirected home', async () => {
    // /admin is wrapped in <RoleGuard minRole="admin">. With no authenticated
    // session the guard redirects to "/" instead of rendering the admin page,
    // so the home Search field should appear and no admin content is shown.
    window.location.hash = '#/admin'
    render(
      <HelmetProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </HelmetProvider>
    )
    expect(await screen.findByLabelText(/search/i)).toBeInTheDocument()
  })
})
