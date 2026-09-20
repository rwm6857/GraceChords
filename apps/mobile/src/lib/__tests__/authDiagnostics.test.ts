import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetAuthDiagnosticsForTest,
  describeAuthError,
  formatAuthDiagnostics,
  getAuthDiagnostics,
  recordAuthFailure,
} from '../authDiagnostics'

describe('describeAuthError', () => {
  it('reads code, status and message off a native error object', () => {
    const err = Object.assign(new Error('DEVELOPER_ERROR'), { code: '10', status: 400 })
    expect(describeAuthError(err)).toEqual({
      code: '10',
      status: 400,
      message: 'DEVELOPER_ERROR',
    })
  })

  it('stringifies a numeric code — Android status codes arrive both ways', () => {
    expect(describeAuthError({ code: 10 }).code).toBe('10')
  })

  it('survives the shapes that are not error objects at all', () => {
    expect(describeAuthError(null)).toEqual({ code: null, status: null, message: 'null' })
    expect(describeAuthError('boom')).toEqual({ code: null, status: null, message: 'boom' })
    expect(describeAuthError({})).toEqual({ code: null, status: null, message: '' })
  })

  it('ignores a non-numeric status rather than coercing it', () => {
    expect(describeAuthError({ status: 'bad' }).status).toBeNull()
  })
})

describe('the diagnostics buffer', () => {
  beforeEach(() => {
    __resetAuthDiagnosticsForTest()
    // recordAuthFailure logs by design; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts empty, so the Settings row stays hidden until something fails', () => {
    expect(getAuthDiagnostics()).toEqual([])
  })

  it('records newest first', () => {
    recordAuthFailure('googleSignIn', { code: '10', status: null, message: 'first' })
    recordAuthFailure('appleSignIn', { code: null, status: null, message: 'second' })
    expect(getAuthDiagnostics().map((e) => e.message)).toEqual(['second', 'first'])
  })

  it('caps the buffer so a retry loop cannot grow it without bound', () => {
    for (let i = 0; i < 30; i += 1) {
      recordAuthFailure('googleSignIn', { code: '10', status: null, message: `e${i}` })
    }
    const entries = getAuthDiagnostics()
    expect(entries).toHaveLength(20)
    expect(entries[0].message).toBe('e29')
  })

  it('logs the code and status to the console for a tethered device', () => {
    recordAuthFailure('googleSignIn', { code: '10', status: null, message: 'DEVELOPER_ERROR' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('code=10'))
  })

  it('formats a copyable block naming the scope and the code', () => {
    recordAuthFailure('googleSignIn', { code: '10', status: null, message: 'DEVELOPER_ERROR' })
    const text = formatAuthDiagnostics()
    expect(text).toContain('googleSignIn')
    expect(text).toContain('code=10')
    expect(text).toContain('DEVELOPER_ERROR')
  })
})
