import { describe, it, expect } from 'vitest'
import {
  localModeration,
  openaiModeration,
  moderateText,
  ModerationUnavailable,
  MAX_LEN,
} from './_moderation.js'

// Fake fetch factories for the AI layer (no network).
function okFetch(payload) {
  return async () => ({ ok: true, status: 200, json: async () => payload })
}
function errFetch(status = 500) {
  return async () => ({ ok: false, status, json: async () => ({}) })
}
function throwFetch() {
  return async () => {
    throw new Error('network down')
  }
}

const clean = { results: [{ flagged: false, categories: {} }] }

describe('localModeration (Layer 1)', () => {
  it('accepts a clean reflection', () => {
    expect(localModeration('Grateful for new mercies this morning.')).toEqual({ allowed: true, reasons: [] })
  })

  it('rejects empty / whitespace-only', () => {
    expect(localModeration('   ').allowed).toBe(false)
    expect(localModeration('   ').reasons).toContain('empty')
  })

  it('rejects over-length', () => {
    const r = localModeration('a'.repeat(MAX_LEN + 1))
    expect(r.allowed).toBe(false)
    expect(r.reasons).toContain('too_long')
  })

  it('rejects URLs and bare domains', () => {
    expect(localModeration('see https://spam.example/x').reasons).toContain('contains_url')
    expect(localModeration('go to www.spam.com').reasons).toContain('contains_url')
    expect(localModeration('visit evil-site.net now').reasons).toContain('contains_url')
  })

  it('rejects blocklisted terms including leetspeak', () => {
    expect(localModeration('this is sh1t').reasons).toContain('blocklisted_term')
    expect(localModeration('you a$$hole').reasons).toContain('blocklisted_term')
  })

  it('does not false-positive on clean words containing a substring', () => {
    // "class" contains no standalone blocklisted word; boundary matching holds.
    expect(localModeration('a wonderful class today').allowed).toBe(true)
  })
})

describe('openaiModeration (Layer 2)', () => {
  it('allows a clean result', async () => {
    const r = await openaiModeration('hello', { OPENAI_API_KEY: 'k' }, okFetch(clean))
    expect(r).toEqual({ allowed: true, reasons: [] })
  })

  it('rejects a flagged result with category reasons', async () => {
    const flagged = { results: [{ flagged: true, categories: { hate: true, violence: false } }] }
    const r = await openaiModeration('bad', { OPENAI_API_KEY: 'k' }, okFetch(flagged))
    expect(r.allowed).toBe(false)
    expect(r.reasons).toContain('openai:hate')
    expect(r.reasons).not.toContain('openai:violence')
  })

  it('fails closed on a non-200 response', async () => {
    await expect(openaiModeration('x', { OPENAI_API_KEY: 'k' }, errFetch(500))).rejects.toBeInstanceOf(
      ModerationUnavailable,
    )
  })

  it('fails closed on a network throw', async () => {
    await expect(openaiModeration('x', { OPENAI_API_KEY: 'k' }, throwFetch())).rejects.toBeInstanceOf(
      ModerationUnavailable,
    )
  })

  it('fails closed when the API key is missing', async () => {
    await expect(openaiModeration('x', {}, okFetch(clean))).rejects.toBeInstanceOf(ModerationUnavailable)
  })
})

describe('moderateText (pipeline)', () => {
  it('rejects at Layer 1 WITHOUT calling the AI layer', async () => {
    let called = false
    const spyFetch = async () => {
      called = true
      return { ok: true, status: 200, json: async () => clean }
    }
    const r = await moderateText('spam http://x.com', { OPENAI_API_KEY: 'k' }, spyFetch)
    expect(r.allowed).toBe(false)
    expect(r.reasons).toContain('contains_url')
    expect(called).toBe(false) // Layer 1 short-circuits before any API call
  })

  it('passes Layer 1 then consults the AI layer', async () => {
    const r = await moderateText('a genuine clean reflection', { OPENAI_API_KEY: 'k' }, okFetch(clean))
    expect(r).toEqual({ allowed: true, reasons: [] })
  })

  it('fails closed when the AI layer errors on otherwise-clean text', async () => {
    await expect(
      moderateText('a genuine clean reflection', { OPENAI_API_KEY: 'k' }, errFetch(503)),
    ).rejects.toBeInstanceOf(ModerationUnavailable)
  })
})
