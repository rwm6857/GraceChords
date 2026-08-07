import { describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_MS,
  FOREGROUND_MS,
  GATE_MS,
  RequestTimeoutError,
  isAbortError,
  isRequestTimeout,
  withDeadline,
  withRequestBudget,
  type FetchFn,
} from '../requestBudget'

// A fetch that never settles until aborted — the blackholed-network case. A
// refusing network fails fast on its own; a HANGING one is what pins a socket
// until the platform default, so it is what these tests model.
function hangingFetch(): FetchFn {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return
      const fail = () => {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        reject(err)
      }
      if (signal.aborted) fail()
      else signal.addEventListener('abort', fail)
    })
}

const okResponse = () => ({ ok: true, status: 200 }) as unknown as Response

describe('budgets', () => {
  it('orders the three budgets by how much the user is waiting', () => {
    // The gate is the only budget the user experiences as "not launched", so it
    // is the tightest; background work must yield to foreground work.
    expect(GATE_MS).toBeLessThan(BACKGROUND_MS)
    expect(BACKGROUND_MS).toBeLessThan(FOREGROUND_MS)
  })

  it("keeps the boot gate at build 12's shipped value", () => {
    expect(GATE_MS).toBe(2500)
  })
})

describe('withRequestBudget', () => {
  it('rejects with RequestTimeoutError once the budget lapses', async () => {
    vi.useFakeTimers()
    try {
      const bounded = withRequestBudget(hangingFetch(), () => 14000)
      const pending = bounded('https://example.test/rest/v1/songs')
      const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError)
      await vi.advanceTimersByTimeAsync(14000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes a request through untouched when budgetFor returns null', async () => {
    const inner = vi.fn(hangingFetch())
    const bounded = withRequestBudget(inner, () => null)
    void bounded('https://example.test/auth/v1/token?grant_type=refresh_token')
    expect(inner).toHaveBeenCalledTimes(1)
    // No signal is attached at all, so nothing can cancel it — this is exactly
    // what keeps build 12's self-heal path alive.
    expect(inner.mock.calls[0][1]?.signal).toBeUndefined()
  })

  it('does not disturb a successful request', async () => {
    const bounded = withRequestBudget(async () => okResponse(), () => 14000)
    await expect(bounded('https://example.test/rest/v1/songs')).resolves.toMatchObject({ ok: true })
  })

  it('clears its timer on success, so a resolved request cannot fire later', async () => {
    vi.useFakeTimers()
    try {
      const bounded = withRequestBudget(async () => okResponse(), () => 100)
      await bounded('https://example.test/rest/v1/songs')
      // If the deadline timer survived, advancing past it would abort a request
      // that already succeeded (and, in the real client, log a phantom failure).
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("surfaces a caller's own abort as an AbortError, not as a timeout", async () => {
    const controller = new AbortController()
    const bounded = withRequestBudget(hangingFetch(), () => 14000)
    const pending = bounded('https://example.test/rest/v1/songs', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toSatisfy(
      (err: unknown) => isAbortError(err) && !isRequestTimeout(err),
    )
  })

  it('honours a signal that is already aborted before the call', async () => {
    const controller = new AbortController()
    controller.abort()
    const bounded = withRequestBudget(hangingFetch(), () => 14000)
    await expect(
      bounded('https://example.test/rest/v1/songs', { signal: controller.signal }),
    ).rejects.toSatisfy(isAbortError)
  })

  it('routes the URL to budgetFor so auth and data can differ', async () => {
    const seen: string[] = []
    const bounded = withRequestBudget(async () => okResponse(), (url) => {
      seen.push(url)
      return url.includes('grant_type=refresh_token') ? null : FOREGROUND_MS
    })
    await bounded('https://example.test/rest/v1/setlists')
    await bounded('https://example.test/auth/v1/token?grant_type=refresh_token')
    expect(seen).toEqual([
      'https://example.test/rest/v1/setlists',
      'https://example.test/auth/v1/token?grant_type=refresh_token',
    ])
  })
})

describe('RequestTimeoutError shape', () => {
  // These are not cosmetic. postgrest-js short-circuits its retry loop only for
  // name 'AbortError' or code 'ABORT_ERR'; every read this app makes is a GET,
  // which postgrest retries 3x with 1s/2s/4s backoff by default. Without
  // ABORT_ERR a single blackholed read costs ~63 s — worse than the platform
  // default this whole module exists to avoid.
  it('presents as ABORT_ERR so postgrest-js will not retry it', () => {
    expect(new RequestTimeoutError(14000).code).toBe('ABORT_ERR')
  })

  it('carries a readable message, because two screens still render error text raw', () => {
    const err = new RequestTimeoutError(14000)
    expect(err.message).toBe('The request timed out.')
    expect(err.message).not.toMatch(/\d{4}/)
  })

  it('keeps the budget available for logging', () => {
    expect(new RequestTimeoutError(7000).budgetMs).toBe(7000)
  })
})

describe('classification through a Supabase query', () => {
  // postgrest-js discards `code` for client-side network errors and reshapes the
  // failure as { message: '<name>: <message>' }, so the message prefix is the
  // only surviving evidence. If this ever regresses, every error branch silently
  // starts treating timeouts as ordinary query failures.
  const flattened = (err: Error) => ({
    message: `${err.name}: ${err.message}`,
    details: '',
    hint: 'Request was aborted (timeout or manual cancellation)',
    code: '',
  })

  it('still recognises a timeout after postgrest flattens it', () => {
    expect(isRequestTimeout(flattened(new RequestTimeoutError(14000)))).toBe(true)
  })

  it('still recognises a deliberate abort after postgrest flattens it', () => {
    const abort = new Error('Aborted')
    abort.name = 'AbortError'
    expect(isAbortError(flattened(abort))).toBe(true)
  })

  it('does not mistake an ordinary query error for either', () => {
    const pgError = {
      message: 'column user_starred_songs.created_at does not exist',
      details: '',
      hint: '',
      code: '42703',
    }
    expect(isRequestTimeout(pgError)).toBe(false)
    expect(isAbortError(pgError)).toBe(false)
  })

  it('never classifies a timeout as a user-initiated abort', () => {
    // reportFailure checks isAbortError FIRST and stays silent when it is
    // true, so a timeout leaking into that branch would hide a real failure.
    const err = new RequestTimeoutError(14000)
    expect(isAbortError(err)).toBe(false)
    expect(isRequestTimeout(err)).toBe(true)
  })

  it('tolerates non-object failures', () => {
    for (const value of [null, undefined, 'boom', 42]) {
      expect(isRequestTimeout(value)).toBe(false)
      expect(isAbortError(value)).toBe(false)
    }
  })
})

describe('withDeadline', () => {
  it('stops waiting at the deadline without cancelling the work', async () => {
    vi.useFakeTimers()
    try {
      let settled = false
      const work = new Promise<string>((resolve) => {
        setTimeout(() => {
          settled = true
          resolve('landed')
        }, 30000)
      })
      const raced = withDeadline(work, BACKGROUND_MS, 'gave-up')
      await vi.advanceTimersByTimeAsync(BACKGROUND_MS)
      await expect(raced).resolves.toBe('gave-up')
      // The underlying work is untouched and still completes — that is what lets
      // a prefetch keep warming the cache for a reader that arrives later.
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(30000)
      expect(settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns the real result when the work wins', async () => {
    await expect(withDeadline(Promise.resolve('landed'), 1000, 'gave-up')).resolves.toBe('landed')
  })

  it('clears its timer when the work wins', async () => {
    vi.useFakeTimers()
    try {
      await withDeadline(Promise.resolve('landed'), 1000, 'gave-up')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
