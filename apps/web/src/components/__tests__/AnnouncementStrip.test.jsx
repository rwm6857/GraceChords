import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The strip's audience gate is UA-driven; drive it directly instead of
// stubbing user-agent strings (platform.test.js covers the parsing itself).
const platform = vi.hoisted(() => ({ ios: false, android: false, nativeBanner: false }))
vi.mock('../../utils/app/platform', () => ({
  isIOS: () => platform.ios,
  isAndroid: () => platform.android,
  isMobile: () => platform.ios || platform.android,
  isIOSSafari: () => platform.nativeBanner,
  isNativeAppBannerActive: () => platform.nativeBanner,
}))

// A fixed instant inside the shipped ios-launch-2026-08 window, so the suite
// keeps passing after the real campaign expires.
const INSIDE_WINDOW = Date.parse('2026-08-15T12:00:00Z')

import AnnouncementStrip from '../AnnouncementStrip'
import { announcements, dismissKey, resolveAnnouncement } from '../../config/announcements'

const LIVE = announcements[0]

function renderStrip(){
  return render(<MemoryRouter><AnnouncementStrip /></MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  platform.ios = false
  platform.android = false
  platform.nativeBanner = false
  vi.setSystemTime(INSIDE_WINDOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AnnouncementStrip', () => {
  it('renders on desktop with a CTA to /download', async () => {
    renderStrip()
    expect(await screen.findByRole('link', { name: /get the app/i })).toHaveAttribute('href', '/download')
  })

  it('renders on Android', async () => {
    platform.android = true
    renderStrip()
    expect(await screen.findByRole('link', { name: /get the app/i })).toBeInTheDocument()
  })

  it('does not render in iOS Safari, where the native Smart App Banner already shows', () => {
    platform.ios = true
    platform.nativeBanner = true
    const { container } = renderStrip()
    expect(container).toBeEmptyDOMElement()
  })

  it('does render in a non-Safari iOS browser, which gets no native banner', async () => {
    platform.ios = true
    platform.nativeBanner = false
    renderStrip()
    expect(await screen.findByRole('link', { name: /get the app/i })).toBeInTheDocument()
  })

  it('exposes a keyboard-reachable dismiss control with an accessible name', async () => {
    const user = userEvent.setup()
    renderStrip()
    const dismiss = screen.getByRole('button', { name: /dismiss announcement/i })

    await user.tab()
    await user.tab()
    expect(dismiss).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: /dismiss announcement/i })).not.toBeInTheDocument()
  })

  it('persists dismissal under a key scoped to the announcement id', async () => {
    const user = userEvent.setup()
    renderStrip()
    await user.click(screen.getByRole('button', { name: /dismiss announcement/i }))

    expect(localStorage.getItem(dismissKey(LIVE.id))).toBe('1')

    // A fresh mount is the reload: the strip must stay gone.
    const { container } = renderStrip()
    expect(container).toBeEmptyDOMElement()
  })

  it('re-shows for a new id even though a previous one was dismissed', () => {
    localStorage.setItem(dismissKey('some-older-announcement'), '1')
    renderStrip()
    expect(screen.getByRole('link', { name: /get the app/i })).toBeInTheDocument()
  })
})

describe('resolveAnnouncement window', () => {
  it('returns the announcement inside its window', () => {
    expect(resolveAnnouncement(INSIDE_WINDOW, 'desktop')?.id).toBe(LIVE.id)
  })

  it('returns null before startsAt', () => {
    expect(resolveAnnouncement(Date.parse(LIVE.startsAt) - 1, 'desktop')).toBeNull()
  })

  it('returns null after endsAt', () => {
    expect(resolveAnnouncement(Date.parse(LIVE.endsAt) + 1, 'desktop')).toBeNull()
  })

  it('returns null for a platform the announcement does not target', () => {
    const restricted = [{ ...LIVE, platforms: ['android'] }]
    const original = announcements.splice(0, announcements.length, ...restricted)
    try {
      expect(resolveAnnouncement(INSIDE_WINDOW, 'desktop')).toBeNull()
      expect(resolveAnnouncement(INSIDE_WINDOW, 'android')?.id).toBe(LIVE.id)
    } finally {
      announcements.splice(0, announcements.length, ...original)
    }
  })
})
