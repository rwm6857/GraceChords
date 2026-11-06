import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, within } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  getUserIdentities: vi.fn(),
  linkIdentity: vi.fn(),
  unlinkIdentity: vi.fn(),
  refreshSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  reauthenticate: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({ supabase: { auth } }))

import SecuritySection from '../SecuritySection'

const apple = { identity_id: 'ia', provider: 'apple', identity_data: { email: 'x@privaterelay.appleid.com' } }
const google = { identity_id: 'ig', provider: 'google', identity_data: { email: 'me@gmail.com' } }

async function setup(user) {
  auth.getUserIdentities.mockResolvedValue({ data: { identities: user.identities }, error: null })
  const view = render(<SecuritySection user={{ email: 'x@privaterelay.appleid.com', ...user }} />)
  // Let the identities reload settle inside act().
  await act(async () => {})
  return view
}

function row(name) {
  return screen.getByText(name, { selector: '.gc-signin-method__name' }).closest('li')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  auth.signOut.mockResolvedValue({ error: null })
  auth.refreshSession.mockResolvedValue({ data: {}, error: null })
})

describe('SecuritySection — password', () => {
  it('asks for the current password on an email account', async () => {
    await setup({ identities: [{ identity_id: 'ie', provider: 'email' }] })
    expect(await screen.findByLabelText('Current password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeTruthy()
  })

  it('offers Set password to an Apple-only account', async () => {
    await setup({ identities: [apple] })
    expect(await screen.findByRole('button', { name: 'Set password' })).toBeTruthy()
    expect(screen.queryByLabelText('Current password')).toBeNull()
  })

  it('asks for an emailed code when the session is too old', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: { code: 'reauthentication_needed' } })
    auth.reauthenticate.mockResolvedValue({ data: {}, error: null })
    await setup({ identities: [apple] })
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'NewPassw0rd!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassw0rd!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByLabelText('Verification code')).toBeTruthy()
    expect(auth.reauthenticate).toHaveBeenCalled()

    auth.updateUser.mockResolvedValue({ data: {}, error: null })
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText(/Password set/)).toBeTruthy()
    expect(auth.updateUser).toHaveBeenLastCalledWith({
      password: 'NewPassw0rd!',
      data: { password_set: true },
      nonce: '123456',
    })
  })
})

describe('SecuritySection — sign-in methods', () => {
  it('never offers to disconnect the only identity', async () => {
    await setup({ identities: [apple] })
    await screen.findByText('x@privaterelay.appleid.com', { selector: '.gc-signin-method__detail' })
    expect(within(row('Apple')).queryByRole('button', { name: 'Disconnect' })).toBeNull()
    expect(within(row('Google')).getByRole('button', { name: 'Connect' })).toBeTruthy()
    expect(screen.getByText(/only connected sign-in method/)).toBeTruthy()
  })

  it('connects Google and comes back to Security', async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null })
    await setup({ identities: [apple] })
    fireEvent.click(await within(row('Google')).findByRole('button', { name: 'Connect' }))
    expect(auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    expect(sessionStorage.getItem('gc_post_auth_redirect')).toBe('/profile#security')
  })

  it('disconnects after confirming when two methods are linked', async () => {
    auth.unlinkIdentity.mockResolvedValue({ data: {}, error: null })
    await setup({ identities: [apple, google] })
    await screen.findByText('me@gmail.com')
    fireEvent.click(within(row('Google')).getByRole('button', { name: 'Disconnect' }))
    auth.getUserIdentities.mockResolvedValue({ data: { identities: [apple] }, error: null })
    await act(async () => {
      fireEvent.click(within(row('Google')).getByRole('button', { name: 'Disconnect Google' }))
    })
    expect(auth.unlinkIdentity).toHaveBeenCalledWith(google)
    expect(auth.refreshSession).toHaveBeenCalled()
    expect(within(row('Google')).getByRole('button', { name: 'Connect' })).toBeTruthy()
  })
})
