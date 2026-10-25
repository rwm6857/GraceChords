import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// lazyRoute keeps a module-level "reload in flight" flag, so each test needs a
// fresh copy of the module.
async function loadLazyRoute(){
  vi.resetModules()
  return import('../utils/app/lazyRoute')
}

function Boundary({ children }){
  return (
    <ErrorCatcher>
      <React.Suspense fallback={<div>suspense-fallback</div>}>{children}</React.Suspense>
    </ErrorCatcher>
  )
}

class ErrorCatcher extends React.Component {
  constructor(props){ super(props); this.state = { error: null } }
  static getDerivedStateFromError(error){ return { error } }
  render(){
    if (this.state.error) return <div>caught: {this.state.error.message}</div>
    return this.props.children
  }
}

let reload

beforeEach(() => {
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
  window.sessionStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lazyRoute', () => {
  it('renders the route when the chunk loads', async () => {
    const { default: lazyRoute } = await loadLazyRoute()
    const Route = lazyRoute(async () => ({ default: () => <div>route-content</div> }))

    render(<Boundary><Route /></Boundary>)

    expect(await screen.findByText('route-content')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  // The reported /admin crash: Vite's __vitePreload swallows a stale-chunk
  // failure into a resolved `undefined`, and React.lazy then dies reading
  // `_result.default` with a TypeError that names nothing useful.
  it('recovers instead of crashing when the chunk resolves without a module', async () => {
    const { default: lazyRoute } = await loadLazyRoute()
    const Route = lazyRoute(async () => undefined)

    render(<Boundary><Route /></Boundary>)

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/caught:/)).not.toBeInTheDocument()
  })

  it('recovers when the chunk import rejects', async () => {
    const { default: lazyRoute } = await loadLazyRoute()
    const Route = lazyRoute(async () => {
      throw new Error('Failed to fetch dynamically imported module')
    })

    render(<Boundary><Route /></Boundary>)

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/caught:/)).not.toBeInTheDocument()
  })

  it('reloads only once even when several routes fail together', async () => {
    const { default: lazyRoute } = await loadLazyRoute()
    const First = lazyRoute(async () => undefined)
    const Second = lazyRoute(async () => undefined)

    render(<Boundary><First /><Second /></Boundary>)

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  // A reload that already happened and didn't help must stop looping and let
  // the error reach the boundary, where it is at least legible.
  it('surfaces the failure when a recent reload already failed to fix it', async () => {
    window.sessionStorage.setItem('gc:chunkReloadAt', String(Date.now()))
    const { default: lazyRoute } = await loadLazyRoute()
    const Route = lazyRoute(async () => undefined)

    render(<Boundary><Route /></Boundary>)

    expect(await screen.findByText(/caught: Route chunk failed to load/)).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  // A chunk the service worker cached in a broken state would fail again after
  // a plain reload, so the app's own caches must be gone before reloading.
  it('clears the service worker asset caches before reloading', async () => {
    const deleted = []
    let deletedAtReload = null
    const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches')
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: async () => ['gracechords-abc123', 'unrelated-cache'],
        delete: async (key) => { deleted.push(key); return true },
      },
    })
    reload.mockImplementation(() => { deletedAtReload = [...deleted] })
    try {
      const { default: lazyRoute } = await loadLazyRoute()
      const Route = lazyRoute(async () => undefined)

      render(<Boundary><Route /></Boundary>)

      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
      expect(deletedAtReload).toEqual(['gracechords-abc123'])
    } finally {
      if (originalCaches) Object.defineProperty(window, 'caches', originalCaches)
      else delete window.caches
    }
  })

  it('reloads again once the cooldown has passed', async () => {
    window.sessionStorage.setItem('gc:chunkReloadAt', String(Date.now() - 20000))
    const { default: lazyRoute } = await loadLazyRoute()
    const Route = lazyRoute(async () => undefined)

    render(<Boundary><Route /></Boundary>)

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })
})
