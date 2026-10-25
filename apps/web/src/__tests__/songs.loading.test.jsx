import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const songsState = vi.hoisted(() => ({ value: null }))

vi.mock('../hooks/useSongs', () => ({
  useSongs: () => songsState.value,
}))
vi.mock('../hooks/usePersonalSongs', () => ({
  usePersonalSongs: () => ({ personalSongs: [] }),
}))

import Songs from '../pages/SongsPage.jsx'

function renderSongs(){
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Songs />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('Songs page while the catalog is unavailable', () => {
  beforeEach(() => {
    songsState.value = { songs: [], loading: false, error: false, retry: vi.fn() }
  })

  test('shows placeholder cards while the first fetch is in flight', () => {
    songsState.value.loading = true
    const { container } = renderSongs()

    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.home-skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('offers a retry when the fetch failed with nothing cached', async () => {
    songsState.value.error = true
    const { container } = renderSongs()

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load songs/i)
    expect(container.querySelectorAll('.home-skeleton')).toHaveLength(0)

    await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }))
    expect(songsState.value.retry).toHaveBeenCalledTimes(1)
  })
})
