import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { AuthProvider, useAuth } from '../useAuth'

// Mock the supabase module
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn().mockImplementation((cb) => {
        // Simulate INITIAL_SESSION with null (not logged in)
        Promise.resolve().then(() => cb('INITIAL_SESSION', null))
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }
}))

describe('useAuth', () => {
  it('starts in loading state', () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>
    const { result } = renderHook(() => useAuth(), { wrapper })
    // Before INITIAL_SESSION fires, session is undefined = loading
    expect(result.current.loading).toBe(true)
  })

  it('resolves to not logged in when session is null', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>
    const { result } = renderHook(() => useAuth(), { wrapper })
    await act(async () => {})
    expect(result.current.loading).toBe(false)
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.session).toBe(null)
  })
})
