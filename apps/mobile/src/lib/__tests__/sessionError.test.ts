import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetSessionErrorForTest,
  hasSessionError,
  markSessionError,
  sessionErrorScope,
} from '../sessionError'
import { actionFailureMessage, failureDetailKey, reportFailure, saveFailureKey } from '../errors'

beforeEach(() => {
  __resetSessionErrorForTest()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sessionError', () => {
  it('starts clean', () => {
    expect(hasSessionError()).toBe(false)
    expect(sessionErrorScope()).toBeNull()
  })

  it('is one-way, and the first failure wins', () => {
    markSessionError('useSong')
    markSessionError('SetlistBuilder.export')
    expect(hasSessionError()).toBe(true)
    expect(sessionErrorScope()).toBe('useSong')
  })
})

describe('errors.ts marks the session', () => {
  it('on a reported load failure', () => {
    expect(reportFailure('useSongList', new Error('boom'))).toBe(true)
    expect(hasSessionError()).toBe(true)
  })

  it('NOT on a deliberate cancellation', () => {
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' })
    expect(reportFailure('downloads', abort)).toBe(false)
    expect(hasSessionError()).toBe(false)
  })

  it('on an offline detail lookup', () => {
    failureDetailKey('useSong', new TypeError('Network request failed'))
    expect(hasSessionError()).toBe(true)
  })

  it('on a failed save', () => {
    saveFailureKey('useSetlistBuilder.save', new Error('boom'))
    expect(hasSessionError()).toBe(true)
  })

  it('on a user-facing action failure, which returns before failureDetailKey', () => {
    const err = Object.assign(new Error('bad base url'), { name: 'UserFacingError' })
    actionFailureMessage('SetlistBuilder.export', err, (k) => k)
    expect(hasSessionError()).toBe(true)
    expect(sessionErrorScope()).toBe('SetlistBuilder.export')
  })
})
