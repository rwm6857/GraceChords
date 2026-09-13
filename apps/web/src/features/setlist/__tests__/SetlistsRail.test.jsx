import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SetlistsRail from '../SetlistsRail'

const SETS = [
  {
    id: 's1',
    name: 'Sunday Morning',
    service_date: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
    songCount: 5,
  },
  {
    id: 's2',
    name: 'Good Friday',
    service_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    songCount: 1,
  },
]

function renderRail(props = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
  }
  render(
    <MemoryRouter>
      <SetlistsRail
        setlists={SETS}
        loading={false}
        error={false}
        currentId="s1"
        limit={30}
        atLimit={false}
        isLoggedIn
        {...handlers}
        {...props}
      />
    </MemoryRouter>
  )
  return handlers
}

describe('SetlistsRail', () => {
  it('lists each set with its song count, pluralized', () => {
    renderRail()
    expect(screen.getByText('Sunday Morning')).toBeInTheDocument()
    expect(screen.getByText(/5 songs/)).toBeInTheDocument()
    expect(screen.getByText(/1 song\b/)).toBeInTheDocument()
  })

  it('marks the open set as current', () => {
    renderRail()
    const open = screen.getByRole('button', { name: /^Sunday Morning/ })
    expect(open).toHaveAttribute('aria-current', 'true')
  })

  it('opens a set on click', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderRail()
    await user.click(screen.getByRole('button', { name: /^Good Friday/ }))
    expect(onOpen).toHaveBeenCalledWith('s2')
  })

  it('creates from the New set button', async () => {
    const user = userEvent.setup()
    const { onCreate } = renderRail()
    await user.click(screen.getByRole('button', { name: 'New set' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('renames inline from the row menu', async () => {
    const user = userEvent.setup()
    const { onRename } = renderRail()
    await user.click(screen.getByRole('button', { name: 'Actions for Sunday Morning' }))
    await user.click(screen.getByRole('menuitem', { name: /Rename/ }))

    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(input)
    await user.type(input, 'Evening Service{Enter}')
    expect(onRename).toHaveBeenCalledWith('s1', 'Evening Service')
  })

  it('confirms before deleting', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderRail()
    await user.click(screen.getByRole('button', { name: 'Actions for Good Friday' }))
    await user.click(screen.getByRole('menuitem', { name: /Delete set/ }))
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onDelete).toHaveBeenCalledWith('s2')
  })

  it('shows usage against the role cap', () => {
    renderRail()
    expect(screen.getByText(/2 of 30 used/)).toBeInTheDocument()
  })

  it('offers sign-in instead of a list when signed out', () => {
    renderRail({ isLoggedIn: false })
    expect(screen.getByText('Sign in to save setlists')).toBeInTheDocument()
    expect(screen.queryByText('Sunday Morning')).not.toBeInTheDocument()
  })

  it('offers a retry when the list fails to load', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderRail({ error: true })
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
