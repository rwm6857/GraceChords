import { describe, it, expect } from 'vitest'
import { fetchPublicFeed, fetchMyHeartedIds } from '@gracechords/core'

// Anonymity guard: the public feed query must NEVER select user_id or any
// author-identifying field, so no author identity reaches the client payload.
// We drive the pure core repo with a fake client that records the select().

function fakeClient(rows: unknown[] = []) {
  const calls: { table: string; select: string; chain: string[][] } = {
    table: '',
    select: '',
    chain: [],
  }
  const builder: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['eq', 'order', 'in']) {
    builder[m] = (...args: unknown[]) => {
      calls.chain.push([m, ...args.map((a) => JSON.stringify(a))])
      return builder
    }
  }
  // Terminal awaits resolve to { data, error }.
  ;(builder as { then?: unknown }).then = (onF: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(onF)
  const client = {
    from(table: string) {
      calls.table = table
      return {
        select(cols: string) {
          calls.select = cols
          return builder
        },
      }
    },
  }
  return { client, calls }
}

const IDENTIFIERS = ['user_id', 'email', 'name', 'display_name']

describe('public feed anonymity', () => {
  it('fetchPublicFeed selects only id/body/heart_count — never an author identifier', async () => {
    const { client, calls } = fakeClient([])
    await fetchPublicFeed(client as never)
    expect(calls.table).toBe('reflections')
    const cols = calls.select.replace(/\s/g, '').split(',')
    expect(cols.sort()).toEqual(['body', 'heart_count', 'id'])
    for (const bad of IDENTIFIERS) expect(calls.select).not.toContain(bad)
  })

  it('fetchPublicFeed filters to public visibility', async () => {
    const { client, calls } = fakeClient([])
    await fetchPublicFeed(client as never)
    expect(calls.chain).toContainEqual(['eq', '"visibility"', '"public"'])
  })

  it('fetchMyHeartedIds returns [] without a query when given no ids', async () => {
    const { client, calls } = fakeClient([])
    const out = await fetchMyHeartedIds(client as never, [])
    expect(out).toEqual([])
    expect(calls.table).toBe('') // short-circuits, no query issued
  })
})
