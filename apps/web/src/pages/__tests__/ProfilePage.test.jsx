import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

const db = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }))
const authState = vi.hoisted(() => ({
  role: 'user',
  refreshProfile: vi.fn(),
  session: { access_token: 't', user: { id: 'u1', email: 'me@example.com', identities: [] } },
  profile: { display_name: 'Me', preferences: { sprite: 'lion', theme: 'dark' } },
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: vi.fn(), getUserIdentities: vi.fn().mockResolvedValue({ data: { identities: [] }, error: null }) },
    from: () => ({ update: db.update }),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: authState.session,
    profile: authState.profile,
    loading: false,
    isLoggedIn: true,
    refreshProfile: authState.refreshProfile,
    role: authState.role,
    isAdmin: authState.role === 'owner' || authState.role === 'admin',
  }),
}))

vi.mock('../../components/TelegramLoginButton', () => ({ default: () => null }))

import ProfilePage from '../ProfilePage'

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.role = 'user'
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ linked: false }) })
  db.eq.mockResolvedValue({ error: null })
  db.update.mockReturnValue({ eq: db.eq })
})

describe('ProfilePage', () => {
  it('opens the icon picker from the avatar and saves the chosen icon', async () => {
    renderPage()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Change your icon' }))
    expect(screen.getByRole('dialog', { name: 'Choose your icon' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'star' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(db.update).toHaveBeenCalledWith({ preferences: { sprite: 'star', theme: 'dark' } })
    expect(authState.refreshProfile).toHaveBeenCalled()
  })

  it('closes the icon picker on Escape without saving', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Change your icon' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('saves only the display name from the identity form', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(db.update).toHaveBeenCalledWith({ display_name: 'New Name' }))
  })

  it('shows no role chip for a regular user', () => {
    renderPage()
    expect(screen.queryByText('User')).toBeNull()
    expect(screen.queryByText('Admin Portal →')).toBeNull()
  })

  it('shows the role chip beside the name for elevated roles', () => {
    authState.role = 'owner'
    renderPage()
    const chip = screen.getByText('Owner')
    expect(chip.closest('.gc-profile-header__name')).toBeTruthy()
  })
})
