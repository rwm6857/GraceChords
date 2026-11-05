import { act, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from '../App.jsx'
import OfflineBanner from '../components/OfflineBanner'
import ErrorBoundary from '../components/ErrorBoundary'
import {
  __resetErrorReporterForTests,
  buildErrorReport,
  reportError,
  shouldReport,
} from '../utils/app/errorReporter'

function renderApp(hash){
  window.location.hash = hash
  return render(
    <HelmetProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </HelmetProvider>
  )
}

describe('404 page', () => {
  test('unknown route renders the not-found page inside the nav layout', async () => {
    renderApp('#/definitely-not-a-page')
    expect(await screen.findByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to the home page/i })).toHaveAttribute('href', '#/')
    expect(screen.getByRole('link', { name: /browse songs/i })).toBeInTheDocument()
  })
})

describe('route-level ErrorBoundary', () => {
  test('shows the crash screen, then clears when resetKey (the path) changes', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Boom(){ throw new Error('kaboom') }
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom /></ErrorBoundary>)
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to home page/i })).toHaveAttribute('href', '/')

    rerender(<ErrorBoundary resetKey="/b"><p>next page</p></ErrorBoundary>)
    expect(screen.getByText('next page')).toBeInTheDocument()
    errSpy.mockRestore()
  })
})

describe('OfflineBanner', () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
  })

  test('appears when the browser goes offline and clears when it reconnects', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByRole('status')).toHaveTextContent(/you're offline/i)

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('errorReporter', () => {
  beforeEach(() => __resetErrorReporterForTests())

  test('report carries the path but never the query string or hash', () => {
    window.history.replaceState(null, '', '/auth/callback?code=secret#access_token=secret')
    const report = buildErrorReport(new TypeError('boom'), { source: 'test' })
    expect(report.path).toBe('/auth/callback')
    expect(JSON.stringify(report)).not.toMatch(/secret/)
    expect(report).toMatchObject({ name: 'TypeError', message: 'boom', source: 'test' })
    window.history.replaceState(null, '', '/')
  })

  test('skips dev builds, chunk-load failures and extension noise', () => {
    expect(shouldReport(new Error('real bug'), { enabled: false })).toBe(false)
    expect(shouldReport(new Error('real bug'), { enabled: true })).toBe(true)
    expect(shouldReport(new Error('Failed to fetch dynamically imported module: /assets/x.js'), { enabled: true })).toBe(false)
    expect(shouldReport(new Error('ResizeObserver loop completed with undelivered notifications.'), { enabled: true })).toBe(false)
    const ext = new Error('x'); ext.stack = 'Error: x\n    at chrome-extension://abc/content.js:1:1'
    expect(shouldReport(ext, { enabled: true })).toBe(false)
  })

  test('does not send from the test (non-production) build', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: beacon })
    reportError(new Error('boom'))
    expect(beacon).not.toHaveBeenCalled()
  })
})
