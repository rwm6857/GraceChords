import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Signed-in coverage for the setlist workspace.
//
// Unlike the hook tests, core's REAL setlistsRepo runs here — only the Supabase
// client is faked. That means the assertions are about the rows that actually
// reach `setlists` and `setlist_songs`: the song uuid rather than the slug,
// positions renumbered on reorder, and a rename re-sending the entries instead
// of emptying the set. Those are the bugs a stubbed updateSetlist cannot catch.

const SONGS = [
  { dbId: 'uuid-abba', id: 'abba', songId: 'abba', title: 'Abba', authors: ['A. Writer'], originalKey: 'D', tempo: 128, tags: [], language: 'en', filename: 'abba.chordpro', chordpro_content: '' },
  { dbId: 'uuid-grace', id: 'grace', songId: 'grace', title: 'Amazing Grace', authors: ['John Newton'], originalKey: 'G', tempo: 72, tags: [], language: 'en', filename: 'amazing_grace.chordpro', chordpro_content: '' },
  { dbId: 'uuid-dox', id: 'doxology', songId: 'doxology', title: 'Doxology', authors: ['Thomas Ken'], originalKey: 'G', tempo: 80, tags: [], language: 'en', filename: 'doxology.chordpro', chordpro_content: '' },
]

const SONG_BY_UUID = new Map(SONGS.map((s) => [s.dbId, s]))

// --- The fake Supabase client -----------------------------------------------
// Chains are thenable at every step, which is what supabase-js does, so the
// repo's `.select().eq().maybeSingle()` and `.update().eq()` both resolve.

let db
let role

function newDb(setlists = []) {
  return {
    setlists: setlists.map((s) => ({ ...s })),
    entries: new Map(setlists.map((s) => [s.id, s.entries || []])),
    calls: [],
  }
}

function embedSong(uuid) {
  const s = SONG_BY_UUID.get(uuid)
  if (!s) return null
  return {
    slug: s.id,
    title: s.title,
    artist: s.authors.join(', '),
    default_key: s.originalKey,
    tempo: s.tempo,
    time_signature: '4/4',
  }
}

function resolve(ctx) {
  db.calls.push(ctx)
  const { table, op, filters, payload } = ctx

  if (table === 'setlists' && op === 'select') {
    if (filters.id) {
      const row = db.setlists.find((s) => s.id === filters.id)
      if (!row) return { data: null, error: null }
      const rows = (db.entries.get(row.id) || []).map((e, i) => ({
        id: `row-${i}`,
        song_id: e.song_id ?? null,
        personal_song_id: e.personal_song_id ?? null,
        verse_ref: e.verse_ref ?? null,
        position: e.position,
        key_override: e.key_override ?? null,
        notes: null,
        songs: e.song_id ? embedSong(e.song_id) : null,
        personal_songs: null,
      }))
      return { data: { ...row, setlist_songs: rows }, error: null }
    }
    const list = db.setlists
      .slice()
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .map((s) => ({ ...s, setlist_songs: [{ count: (db.entries.get(s.id) || []).length }] }))
    return { data: list, error: null }
  }

  if (table === 'setlists' && op === 'insert') {
    if (db.insertError) return { data: null, error: { message: db.insertError } }
    const row = {
      id: payload.id || `generated-${db.setlists.length + 1}`,
      name: payload.name,
      service_date: payload.service_date,
      created_at: '2026-09-13T00:00:00.000Z',
      updated_at: new Date().toISOString(),
      owner_id: payload.owner_id,
      team_id: payload.team_id,
    }
    db.setlists.unshift(row)
    db.entries.set(row.id, [])
    return { data: row, error: null }
  }

  if (table === 'setlists' && op === 'update') {
    const row = db.setlists.find((s) => s.id === filters.id)
    if (row) Object.assign(row, payload, { updated_at: new Date().toISOString() })
    return { data: null, error: null }
  }

  if (table === 'setlists' && op === 'delete') {
    db.setlists = db.setlists.filter((s) => s.id !== filters.id)
    db.entries.delete(filters.id)
    return { data: null, error: null }
  }

  if (table === 'setlist_songs' && op === 'delete') {
    db.entries.set(filters.setlist_id, [])
    return { data: null, error: null }
  }

  if (table === 'setlist_songs' && op === 'insert') {
    const rows = Array.isArray(payload) ? payload : [payload]
    db.entries.set(rows[0].setlist_id, rows)
    return { data: null, error: null }
  }

  return { data: null, error: null }
}

function builder(table, op, payload) {
  const ctx = { table, op, payload, filters: {} }
  const b = {
    select(sel) {
      if (op === 'from') ctx.op = 'select'
      ctx.select = sel
      return b
    },
    is(col, val) {
      ctx.filters[col] = val
      return b
    },
    eq(col, val) {
      ctx.filters[col] = val
      return b
    },
    order() {
      return b
    },
    limit() {
      return b
    },
    maybeSingle() {
      return b
    },
    single() {
      return b
    },
    then(onOk, onErr) {
      return Promise.resolve(resolve(ctx)).then(onOk, onErr)
    },
  }
  return b
}

const supabase = {
  from(table) {
    return {
      select: (sel) => builder(table, 'select').select(sel),
      insert: (payload) => builder(table, 'insert', payload),
      update: (payload) => builder(table, 'update', payload),
      delete: () => builder(table, 'delete'),
    }
  },
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  },
}

vi.mock('../../lib/supabase', () => ({ supabase }))
vi.mock('../../hooks/useSongs', () => ({ useSongs: () => ({ songs: SONGS, loading: false }) }))
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: true, role, session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, profile: null, hasMinRole: () => false, loading: false }),
}))
vi.mock('../../components/PushToTelegramButton', () => ({ default: () => null }))

let SetlistWorkspacePage

beforeEach(async () => {
  vi.resetModules()
  role = 'user'
  db = newDb()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.clear()
  ;({ default: SetlistWorkspacePage } = await import('../SetlistWorkspacePage'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

function renderAt(path) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/setlists" element={<SetlistWorkspacePage />} />
        <Route path="/setlists/:id" element={<SetlistWorkspacePage />} />
        <Route path="/setlist" element={<SetlistWorkspacePage />} />
      </Routes>
    </MemoryRouter>
  )
  return user
}

/** The setlists rail, so its "New set" isn't confused with the empty state's. */
function rail() {
  return within(screen.getByRole('navigation', { name: 'Saved Sets' }))
}

/** Every row written to setlist_songs by the last wipe-and-replace. */
function lastEntryInsert() {
  const inserts = db.calls.filter((c) => c.table === 'setlist_songs' && c.op === 'insert')
  return inserts.length ? inserts[inserts.length - 1].payload : null
}

async function settleSave() {
  await vi.advanceTimersByTimeAsync(900)
}

const SEEDED = [
  {
    id: 'set-1',
    name: 'Sunday Morning',
    service_date: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:00.000Z',
    entries: [{ song_id: 'uuid-abba', position: 0, key_override: null }],
  },
  {
    id: 'set-2',
    name: 'Good Friday',
    service_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    entries: [],
  },
]

describe('setlist workspace, signed in', () => {
  it('lists the personal setlists with their song counts', async () => {
    db = newDb(SEEDED)
    renderAt('/setlists')

    await waitFor(() => expect(screen.getByText('Sunday Morning')).toBeInTheDocument())
    expect(screen.getByText(/1 song\b/)).toBeInTheDocument()
    expect(screen.getByText(/0 songs/)).toBeInTheDocument()
  })

  it('creates a set optimistically and inserts it as a personal set', async () => {
    db = newDb(SEEDED)
    const user = renderAt('/setlists')
    await waitFor(() => expect(screen.getByText('Sunday Morning')).toBeInTheDocument())

    await user.click(rail().getByRole('button', { name: 'New set' }))

    await waitFor(() => {
      const insert = db.calls.find((c) => c.table === 'setlists' && c.op === 'insert')
      expect(insert).toBeTruthy()
      expect(insert.payload).toMatchObject({ owner_id: 'user-1', team_id: null })
      // The id is minted client-side so the builder can open before the INSERT lands.
      expect(insert.payload.id).toBeTruthy()
    })
  })

  it('writes song uuids and positions, not catalog slugs', async () => {
    db = newDb(SEEDED)
    const user = renderAt('/setlists/set-1')
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sunday Morning/ })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /^Doxology/ }))
    await settleSave()

    await waitFor(() => expect(lastEntryInsert()).toHaveLength(2))
    expect(lastEntryInsert()).toEqual([
      { setlist_id: 'set-1', position: 0, key_override: null, notes: null, song_id: 'uuid-abba' },
      { setlist_id: 'set-1', position: 1, key_override: null, notes: null, song_id: 'uuid-dox' },
    ])
  })

  it('renumbers positions on reorder', async () => {
    db = newDb(SEEDED)
    const user = renderAt('/setlists/set-1')
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sunday Morning/ })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /^Doxology/ }))
    await settleSave()
    await waitFor(() => expect(lastEntryInsert()).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: /Move up — Doxology/ }))
    await settleSave()

    await waitFor(() =>
      expect(lastEntryInsert().map((r) => [r.song_id, r.position])).toEqual([
        ['uuid-dox', 0],
        ['uuid-abba', 1],
      ])
    )
  })

  it('stores a key change as key_override on the right row', async () => {
    db = newDb(SEEDED)
    const user = renderAt('/setlists/set-1')
    await waitFor(() => expect(screen.getByRole('heading', { name: /Sunday Morning/ })).toBeInTheDocument())

    await user.selectOptions(screen.getByRole('combobox'), 'F')
    await settleSave()

    await waitFor(() => expect(lastEntryInsert()?.[0].key_override).toBe('F'))
  })

  it('renaming from the rail keeps the set’s songs', async () => {
    // updateSetlist wipes and re-inserts every row, so a rename that sent no
    // songs would rename the set AND empty it. The rail re-reads the entries
    // first; this is the guard on that round trip.
    db = newDb(SEEDED)
    const user = renderAt('/setlists/set-2')
    await waitFor(() => expect(screen.getByText('Sunday Morning')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Actions for Sunday Morning' }))
    await user.click(screen.getByRole('menuitem', { name: /Rename/ }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(input)
    await user.type(input, 'Evening Service{Enter}')

    await waitFor(() => {
      const row = db.setlists.find((s) => s.id === 'set-1')
      expect(row.name).toBe('Evening Service')
    })
    expect(db.entries.get('set-1')).toHaveLength(1)
    expect(db.entries.get('set-1')[0].song_id).toBe('uuid-abba')
  })

  it('deletes a set and drops it from the rail', async () => {
    db = newDb(SEEDED)
    const user = renderAt('/setlists')
    await waitFor(() => expect(screen.getByText('Good Friday')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Actions for Good Friday' }))
    await user.click(screen.getByRole('menuitem', { name: /Delete set/ }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))

    await waitFor(() => expect(db.setlists.map((s) => s.id)).toEqual(['set-1']))
    await waitFor(() => expect(screen.queryByText('Good Friday')).not.toBeInTheDocument())
  })

  it('offers a prune instead of inserting when the role cap is reached', async () => {
    // The `user` cap is 30 (packages/core/src/setlists/limits.js).
    db = newDb(
      Array.from({ length: 30 }, (_, i) => ({
        id: `set-${i}`,
        name: `Set ${i}`,
        service_date: null,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        entries: [],
      }))
    )
    const user = renderAt('/setlists')
    await waitFor(() => expect(screen.getByText('Set 0')).toBeInTheDocument())

    await user.click(rail().getByRole('button', { name: 'New set' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Setlist limit reached/i)).toBeInTheDocument()
    expect(db.calls.some((c) => c.table === 'setlists' && c.op === 'insert')).toBe(false)
  })

  it('rolls the optimistic row back when the DB trigger rejects the insert', async () => {
    // A stale role read can let an over-cap create reach the trigger.
    db = newDb(SEEDED)
    db.insertError = 'PERSONAL_SETLIST_LIMIT_REACHED'
    const user = renderAt('/setlists')
    await waitFor(() => expect(screen.getByText('Sunday Morning')).toBeInTheDocument())

    await user.click(rail().getByRole('button', { name: 'New set' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // Only the two seeded sets remain in the rail — the optimistic one is gone.
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /Actions for/ })).toHaveLength(2)
    )
  })
})
