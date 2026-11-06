import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  recovery: false,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      updateUser: auth.updateUser,
      signOut: auth.signOut,
      signUp: auth.signUp,
      signInWithOAuth: auth.signInWithOAuth,
    },
    from: vi.fn(),
  },
  isRecoverySession: () => auth.recovery,
  clearRecoverySession: vi.fn(() => { auth.recovery = false }),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ refreshProfile: vi.fn(), isLoggedIn: false, loading: false }),
}))

import ResetPasswordPage from '../ResetPasswordPage'
import AuthCallbackPage from '../AuthCallbackPage'
import SignupPage from '../SignupPage'

const SESSION = { user: { id: 'u1', email: 'me@example.com' } }

function renderAt(path, element, routePath) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath ?? path.split(/[?#]/)[0]} element={element} />
        <Route path="/profile" element={<p>profile page</p>} />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/" element={<p>home page</p>} />
        <Route path="/setlist" element={<p>setlist page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.recovery = false
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  auth.signOut.mockResolvedValue({ error: null })
})

describe('ResetPasswordPage', () => {
  it('sends an ordinary signed-in user to Profile → Security', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    renderAt('/reset-password', <ResetPasswordPage />)
    expect(await screen.findByText('profile page')).toBeTruthy()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('shows the expired state with no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } })
    renderAt('/reset-password', <ResetPasswordPage />)
    expect(await screen.findByText('Link expired')).toBeTruthy()
  })

  it('rejects a weak password from a recovery link before calling the server', async () => {
    auth.recovery = true
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    renderAt('/reset-password', <ResetPasswordPage />)
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'password1' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Password must include an uppercase and a lowercase letter, a number and a symbol.',
    )
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('updates the password and signs other sessions out', async () => {
    auth.recovery = true
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    auth.updateUser.mockResolvedValue({ data: {}, error: null })
    renderAt('/reset-password', <ResetPasswordPage />)
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'NewPassw0rd!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassw0rd!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Password updated')).toBeTruthy()
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'NewPassw0rd!' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
})

describe('AuthCallbackPage', () => {
  it('goes to the remembered destination after sign-in', async () => {
    sessionStorage.setItem('gc_post_auth_redirect', '/setlist')
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    renderAt('/auth/callback', <AuthCallbackPage />)
    expect(await screen.findByText('setlist page')).toBeTruthy()
  })

  it('never follows an off-site remembered destination', async () => {
    sessionStorage.setItem('gc_post_auth_redirect', '//evil.example')
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    renderAt('/auth/callback', <AuthCallbackPage />)
    expect(await screen.findByText('home page')).toBeTruthy()
  })

  it('explains a provider already linked to another account', async () => {
    window.history.replaceState(null, '', '/auth/callback#error=server_error&error_code=identity_already_exists')
    auth.getSession.mockResolvedValue({ data: { session: SESSION } })
    renderAt('/auth/callback', <AuthCallbackPage />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/already connected to a different GraceChords account/)
  })

  it('shows a generic failure for a cancelled sign-in and links back to sign in', async () => {
    window.history.replaceState(null, '', '/auth/callback?error=access_denied&error_description=user_cancelled')
    auth.getSession.mockResolvedValue({ data: { session: null } })
    renderAt('/auth/callback', <AuthCallbackPage />)
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't complete sign-in. Please try again.")
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeTruthy()
  })
})

describe('SignupPage', () => {
  it('enforces the full password policy, not just length', async () => {
    renderAt('/signup', <SignupPage />)
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: 'charlie' }))
    fireEvent.submit(screen.getByLabelText('Password').closest('form'))
    await waitFor(() => expect(screen.getByText(/must include an uppercase/)).toBeTruthy())
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('offers Apple as well as Google', () => {
    renderAt('/signup', <SignupPage />)
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })
})
