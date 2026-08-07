import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UserFacingError,
  actionFailureMessage,
  errMessage,
  failureDetailKey,
  reportFailure,
  saveFailureKey,
} from '../errors'
import { RequestTimeoutError } from '../requestBudget'

// A stand-in for a screen's `t`: echoes the key so assertions read as keys.
const t = (key: string) => `t(${key})`

// Supabase's PostgREST error shape — a plain object, not an Error instance.
const pgError = (message: string, code = '42703') => ({
  message,
  details: '',
  hint: '',
  code,
})

/** How postgrest-js reshapes a thrown fetch error: name folded into message. */
const flattened = (err: Error) => pgError(`${err.name}: ${err.message}`, '')

let logged: string[]

beforeEach(() => {
  logged = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('errMessage', () => {
  it('reads Error instances, Supabase error objects and strings', () => {
    expect(errMessage(new Error('boom'))).toBe('boom')
    expect(errMessage(pgError('column does not exist'))).toBe('column does not exist')
    expect(errMessage('plain')).toBe('plain')
  })
})

describe('reportFailure', () => {
  it('reports a real failure and logs the reason', () => {
    expect(reportFailure('useSongList', pgError('column x does not exist'))).toBe(true)
    expect(logged).toEqual(['[useSongList] failed: column x does not exist'])
  })

  it('names our own deadline in the log rather than echoing its message', () => {
    expect(reportFailure('useSongList', new RequestTimeoutError(14000))).toBe(true)
    expect(logged).toEqual(['[useSongList] failed: request timed out'])
  })

  it('stays silent for a deliberate cancellation', () => {
    const abort = new Error('Aborted')
    abort.name = 'AbortError'
    expect(reportFailure('downloads', abort)).toBe(false)
    expect(logged).toEqual([])
  })
})

describe('failureDetailKey', () => {
  it('points at connection advice when the deadline fired', () => {
    expect(failureDetailKey('useSong', new RequestTimeoutError(14000))).toBe('errors:load.hint')
  })

  it("points at connection advice for React Native's bare network failure", () => {
    // RN gives no code and no cause here — only this string.
    const rnFailure = new TypeError('Network request failed')
    expect(failureDetailKey('useSong', rnFailure)).toBe('errors:load.hint')
  })

  it('recognises a network failure after postgrest flattens it', () => {
    expect(failureDetailKey('useSong', flattened(new TypeError('Network request failed')))).toBe(
      'errors:load.hint',
    )
  })

  it('falls back to generic copy for a real query error', () => {
    // Telling someone to check their connection would be a lie here.
    expect(failureDetailKey('useSong', pgError('column x does not exist'))).toBe('errors:tryAgain')
  })

  it('never returns the raw message', () => {
    const key = failureDetailKey('useSong', pgError('column user_starred_songs.created_at ...'))
    expect(key).not.toContain('created_at')
    // …but the real reason is still logged for whoever is debugging.
    expect(logged[0]).toContain('created_at')
  })
})

describe('saveFailureKey', () => {
  it('always says the changes are unsaved, whatever went wrong', () => {
    // Mid-edit, the useful fact is "your work is not persisted" — not the cause.
    // The debounced save retries itself, so there is nothing to tap.
    expect(saveFailureKey('builder', new RequestTimeoutError(14000))).toBe('errors:saveFailed')
    expect(saveFailureKey('builder', pgError('deadlock detected', '40P01'))).toBe(
      'errors:saveFailed',
    )
  })

  it('logs the real reason', () => {
    saveFailureKey('useSetlistBuilder.save', pgError('deadlock detected', '40P01'))
    expect(logged).toEqual(['[useSetlistBuilder.save] save failed: deadlock detected'])
  })
})

describe('actionFailureMessage', () => {
  it('replaces raw Postgres text with localized copy', () => {
    const body = actionFailureMessage('Setlists.delete', pgError('violates foreign key'), t)
    expect(body).toBe('t(errors:tryAgain)')
    expect(body).not.toContain('foreign key')
  })

  it('gives connection advice on a timeout instead of the deadline token', () => {
    const body = actionFailureMessage('SetlistBuilder.export', new RequestTimeoutError(14000), t)
    expect(body).toBe('t(errors:load.hint)')
    expect(body).not.toMatch(/timed out|RequestTimeoutError|\d{4}/)
  })

  it('passes a UserFacingError through verbatim', () => {
    // api.ts's misconfigured-base-URL hint names the exact fix; replacing it with
    // "Something went wrong" would strand whoever is testing a bad build.
    const hint =
      'The API rejected the request (405) — EXPO_PUBLIC_API_BASE_URL likely points at a ' +
      'redirecting domain. Set it to the canonical one (e.g. https://www.gracechords.com).'
    expect(actionFailureMessage('SongbookBuilder.export', new UserFacingError(hint), t)).toBe(hint)
  })

  it('strips the class-name prefix if a UserFacingError was flattened', () => {
    const flat = flattened(new UserFacingError('Set the canonical base URL.'))
    expect(actionFailureMessage('export', flat, t)).toBe('Set the canonical base URL.')
  })

  it('logs in every branch, so nothing fails silently', () => {
    actionFailureMessage('a', pgError('boom'), t)
    actionFailureMessage('b', new RequestTimeoutError(7000), t)
    actionFailureMessage('c', new UserFacingError('fix your config'), t)
    expect(logged).toHaveLength(3)
    expect(logged[0]).toContain('[a]')
    expect(logged[1]).toContain('request timed out')
    expect(logged[2]).toContain('fix your config')
  })
})
