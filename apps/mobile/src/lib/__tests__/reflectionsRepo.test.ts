import { describe, expect, it } from 'vitest'
import {
  createReflection,
  deleteReflection,
  fetchReflectionForDate,
  fetchReflections,
  isDuplicateReflectionError,
} from '@gracechords/core'

// The reflections repo is pure + client-injected. These tests drive it with a
// fake Supabase query builder that records the chained calls, verifying the
// security-relevant invariants (private-only insert, own-scoped queries) and the
// graceful duplicate-day detection without any network or native deps.

type Recorded = { table: string; calls: string[][]; result: { data: unknown; error: unknown } }

function fakeClient(result: { data?: unknown; error?: unknown } = {}, userId = 'user-1') {
  const recorded: Recorded = { table: '', calls: [], result: { data: result.data ?? null, error: result.error ?? null } }
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  // Every query method records its name+args and returns the builder so chains
  // work; the terminal awaits resolve to the configured result.
  for (const m of ['select', 'eq', 'order', 'insert', 'delete']) {
    builder[m] = (...args: unknown[]) => {
      recorded.calls.push([m, ...args.map((a) => JSON.stringify(a))])
      return builder
    }
  }
  builder.single = async () => recorded.result
  builder.maybeSingle = async () => recorded.result
  // A bare `await builder` (e.g. delete().eq()) resolves to the result too.
  ;(builder as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(recorded.result).then(onFulfilled)

  const client = {
    from: (table: string) => {
      recorded.table = table
      return builder
    },
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  }
  return { client, recorded }
}

describe('reflectionsRepo', () => {
  it('createReflection always writes visibility=private with the auth user id', async () => {
    const inserted: Record<string, unknown>[] = []
    const { client } = fakeClient({ data: { id: 'r1' } }, 'user-42')
    // Capture the insert payload.
    const origFrom = client.from
    client.from = (table: string) => {
      const b = origFrom(table) as Record<string, (...a: unknown[]) => unknown>
      const origInsert = b.insert
      b.insert = (row: unknown) => {
        inserted.push(row as Record<string, unknown>)
        return origInsert(row)
      }
      return b
    }

    await createReflection(client as never, { reflectionDate: '2026-07-19', body: '  hello  ' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      user_id: 'user-42',
      reflection_date: '2026-07-19',
      body: 'hello', // trimmed
      visibility: 'private',
      content_key: null,
    })
  })

  it('fetchReflections returns ALL own reflections (private + public) newest first', async () => {
    const { client, recorded } = fakeClient({ data: [] })
    await fetchReflections(client as never)
    expect(recorded.table).toBe('reflections')
    // Phase 2B: the journal shows both kinds, so no visibility filter here.
    expect(recorded.calls).not.toContainEqual(['eq', '"visibility"', '"private"'])
    expect(recorded.calls).toContainEqual(['order', '"reflection_date"', '{"ascending":false}'])
  })

  it('fetchReflectionForDate filters by day and returns null when absent', async () => {
    const { client, recorded } = fakeClient({ data: null })
    const row = await fetchReflectionForDate(client as never, '2026-07-19')
    expect(row).toBeNull()
    expect(recorded.calls).toContainEqual(['eq', '"reflection_date"', '"2026-07-19"'])
  })

  it('deleteReflection deletes by id', async () => {
    const { client, recorded } = fakeClient({ data: null })
    await deleteReflection(client as never, 'r1')
    expect(recorded.calls).toContainEqual(['delete'])
    expect(recorded.calls).toContainEqual(['eq', '"id"', '"r1"'])
  })

  it('createReflection throws when unauthenticated', async () => {
    const client = {
      from: () => ({}),
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    }
    await expect(createReflection(client as never, { reflectionDate: '2026-07-19', body: 'x' })).rejects.toThrow()
  })

  it('isDuplicateReflectionError recognizes the unique-index violation', () => {
    expect(isDuplicateReflectionError({ code: '23505' })).toBe(true)
    expect(isDuplicateReflectionError({ message: 'duplicate key value violates unique constraint "reflections_one_per_day"' })).toBe(true)
    expect(isDuplicateReflectionError({ code: '42501' })).toBe(false)
    expect(isDuplicateReflectionError(null)).toBe(false)
  })
})
