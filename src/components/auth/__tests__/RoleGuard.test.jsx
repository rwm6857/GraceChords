import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// useAuth is swapped per test via the mutable holder below.
const authMock = vi.hoisted(() => ({ value: {} }))
const navigateMock = vi.hoisted(() => ({ fn: vi.fn() }))
const toastMock = vi.hoisted(() => ({ fn: vi.fn() }))

vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => authMock.value }))
vi.mock('../../../utils/app/toast', () => ({ showToast: (...args) => toastMock.fn(...args) }))
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateMock.fn,
}))

import RoleGuard from '../RoleGuard'

function renderGuard(minRole = 'admin') {
  return render(
    <MemoryRouter>
      <RoleGuard minRole={minRole}>
        <div>SECRET ADMIN CONTENT</div>
      </RoleGuard>
    </MemoryRouter>
  )
}

beforeEach(() => {
  navigateMock.fn.mockReset()
  toastMock.fn.mockReset()
})

describe('RoleGuard', () => {
  it('renders children when the user meets the minimum role', () => {
    authMock.value = { loading: false, isLoggedIn: true, hasMinRole: () => true }
    renderGuard('admin')
    expect(screen.getByText('SECRET ADMIN CONTENT')).toBeInTheDocument()
    expect(navigateMock.fn).not.toHaveBeenCalled()
  })

  it('redirects home with a toast when the user is not logged in', async () => {
    authMock.value = { loading: false, isLoggedIn: false, hasMinRole: () => false }
    renderGuard('admin')
    expect(screen.queryByText('SECRET ADMIN CONTENT')).toBeNull()
    await waitFor(() => {
      expect(navigateMock.fn).toHaveBeenCalledWith('/', { replace: true })
    })
    expect(toastMock.fn).toHaveBeenCalled()
  })

  it('redirects when logged in but the role is too low', async () => {
    authMock.value = { loading: false, isLoggedIn: true, hasMinRole: () => false }
    renderGuard('admin')
    expect(screen.queryByText('SECRET ADMIN CONTENT')).toBeNull()
    await waitFor(() => {
      expect(navigateMock.fn).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('renders nothing and does not redirect while auth is still loading', () => {
    authMock.value = { loading: true, isLoggedIn: false, hasMinRole: () => false }
    renderGuard('admin')
    expect(screen.queryByText('SECRET ADMIN CONTENT')).toBeNull()
    expect(navigateMock.fn).not.toHaveBeenCalled()
  })

  it('keeps showing children during a background refresh after access was confirmed', () => {
    // First render: permitted — confirms access (sets the internal ref).
    authMock.value = { loading: false, isLoggedIn: true, hasMinRole: () => true }
    const { rerender } = renderGuard('admin')
    expect(screen.getByText('SECRET ADMIN CONTENT')).toBeInTheDocument()

    // A transient token refresh flips loading on without revoking access:
    // children must stay mounted and no redirect should fire.
    authMock.value = { loading: true, isLoggedIn: true, hasMinRole: () => true }
    rerender(
      <MemoryRouter>
        <RoleGuard minRole="admin">
          <div>SECRET ADMIN CONTENT</div>
        </RoleGuard>
      </MemoryRouter>
    )
    expect(screen.getByText('SECRET ADMIN CONTENT')).toBeInTheDocument()
    expect(navigateMock.fn).not.toHaveBeenCalled()
  })
})
