import React, { useCallback, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/layout-kit/Button'
import SegmentedControl from '../components/ui/layout-kit/SegmentedControl'
import '../styles/admin-portal.css'

// Admin view of Setlist Stats across everyone. All numbers come from one RPC,
// get_song_stats_admin(), over the song_stats_admin views. The database does
// the privacy work (no user ids, owner excluded, figures from fewer than 5
// people come back NULL); this page only lays the numbers out.

const FEATURE_LABELS = {
  tuner: 'Tuner',
  metronome: 'Metronome',
  pitch_pipe: 'Pitch pipe',
  key_reference: 'Key reference',
  capo: 'Capo',
  performer_mode: 'Performer mode',
  pdf_export: 'PDF export',
  image_export: 'Image export',
  daily_word: 'Daily Word',
  telegram_link: 'Telegram link',
}

function num(v) {
  return v == null ? '—' : Number(v).toLocaleString()
}

function pct(v) {
  return v == null ? '' : ` (${Number(v).toLocaleString()}%)`
}

// Dates arrive as 'YYYY-MM-DD' or ISO timestamps; show them in UTC so a
// bucketed day never shifts by the viewer's time zone.
function day(v, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!v) return '—'
  return new Date(v.length === 10 ? `${v}T00:00:00Z` : v).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' })
}

function monthKey(offset) {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - offset)
  return d.toISOString().slice(0, 8) + '01'
}

function Table({ head, rows, empty = 'Nothing yet.' }) {
  if (!rows.length) return <p className="gc-portal-empty">{empty}</p>
  return (
    <div className="gc-admin-stats-table-wrap">
      <table className="gc-admin-stats-table">
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={i === 0 ? undefined : 'is-num'}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>{cells.map((c, i) => <td key={i} className={i === 0 ? undefined : 'is-num'}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SongList({ title, items }) {
  return (
    <details className="gc-admin-stats-songlist">
      <summary>{title}: {items.length.toLocaleString()}</summary>
      {items.length ? (
        <ul>{items.map((s, i) => <li key={i}>{s.title}</li>)}</ul>
      ) : (
        <p className="gc-portal-empty">None.</p>
      )}
    </details>
  )
}

function songTitle(s) {
  return s.removed_from_library ? `${s.title || 'Untitled'} (removed)` : s.title || 'Untitled'
}

export default function AdminStatsPage() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('weekly')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('get_song_stats_admin')
    if (rpcError) {
      console.error('[AdminStatsPage] get_song_stats_admin:', rpcError)
      setError(rpcError)
    } else {
      setError(null)
      setReport(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // PGRST202: PostgREST can't find the function, i.e. the migration isn't applied.
  const notSetUp = error?.code === 'PGRST202'

  function renderReport(r) {
    const c = r.coverage || {}
    const thisMonth = monthKey(0)
    const lastMonth = monthKey(1)
    const monthUses = (feature, month) =>
      r.feature_monthly.find(m => m.feature === feature && m.month === month)?.uses ?? 0

    return (
      <>
        <section className="gc-portal-section">
          <h2>Library, last 90 days</h2>
          <div className="gc-admin-stats-tiles">
            <div className="gc-admin-stats-tile">
              <span className="gc-admin-stats-tile__value">{num(c.library_songs)}</span>
              <span className="gc-admin-stats-tile__label">Published songs</span>
            </div>
            <div className="gc-admin-stats-tile">
              <span className="gc-admin-stats-tile__value">{num(c.sung_90d)}<small>{pct(c.sung_90d_pct)}</small></span>
              <span className="gc-admin-stats-tile__label">Sung</span>
            </div>
            <div className="gc-admin-stats-tile">
              <span className="gc-admin-stats-tile__value">{num(c.sung_or_opened_90d)}<small>{pct(c.sung_or_opened_90d_pct)}</small></span>
              <span className="gc-admin-stats-tile__label">Sung or opened</span>
            </div>
          </div>
          <SongList title="Never sung" items={r.never_sung} />
          <SongList title="Never sung or opened" items={r.never_sung_or_opened} />
        </section>

        <section className="gc-portal-section">
          <h2>People running sets</h2>
          <SegmentedControl
            className="gc-admin-stats-period"
            ariaLabel="Period"
            options={[{ value: 'weekly', label: 'By week' }, { value: 'monthly', label: 'By month' }]}
            value={period}
            onChange={setPeriod}
          />
          {period === 'weekly' ? (
            <Table
              head={['Week of', 'People', 'Sets']}
              rows={r.weekly.map(w => [day(w.period_start), num(w.active_users), num(w.sets)])}
            />
          ) : (
            <Table
              head={['Month', 'People', 'Sets', 'Sets per person (avg)', 'Median']}
              rows={r.monthly.map(m => [
                day(m.period_start, { month: 'long', year: 'numeric' }),
                num(m.active_users), num(m.sets), num(m.mean_sets), num(m.median_sets),
              ])}
            />
          )}
        </section>

        <section className="gc-portal-section">
          <h2>Sets</h2>
          <div className="gc-admin-stats-split">
            <div>
              <h3>Songs per set</h3>
              <Table
                head={['Songs', 'Sets', 'People']}
                rows={r.set_lengths.map(s => [s.songs_per_set, num(s.sets), num(s.users)])}
              />
            </div>
            <div>
              <h3>Sets each person has run</h3>
              <Table
                head={['Sets run', 'People']}
                rows={r.depth.map(d => [d.lifetime_sets, num(d.users)])}
              />
            </div>
          </div>
        </section>

        <section className="gc-portal-section">
          <h2>Most sung</h2>
          <Table
            head={['Song', 'Plays', 'Sets', 'People', 'Last sung']}
            rows={r.most_sung.map(s => [songTitle(s), num(s.plays), num(s.sets), num(s.reach), day(s.last_played)])}
          />
        </section>

        <section className="gc-portal-section">
          <h2>Most opened</h2>
          <Table
            head={['Song', 'Opens', 'People', 'Last opened']}
            rows={r.most_opened.map(s => [songTitle(s), num(s.opens), num(s.reach), day(s.last_opened)])}
          />
        </section>

        <section className="gc-portal-section">
          <h2>Features</h2>
          <p className="gc-portal-page__subtitle">
            Anonymous daily counts. Tuner, metronome, pitch pipe, key reference and capo exist only in the app,
            so this isn&apos;t a web-versus-app comparison.
          </p>
          <Table
            head={['Feature', 'This month', 'Last month', 'All time', 'Since']}
            rows={r.feature_totals.map(f => [
              FEATURE_LABELS[f.feature] || f.feature,
              num(monthUses(f.feature, thisMonth)),
              num(monthUses(f.feature, lastMonth)),
              num(f.uses),
              day(f.first_day),
            ])}
          />
        </section>
      </>
    )
  }

  return (
    <div className="gc-portal-page container">
      <Helmet><title>Setlist Stats – Admin – GraceChords</title></Helmet>

      <p className="gc-admin-stats-back"><Link to="/admin">← Admin Portal</Link></p>
      <h1>Setlist Stats</h1>
      <p className="gc-portal-page__subtitle">
        Usage across everyone except the owner. Only library songs count, never personal ones.
        A dash means fewer than {report?.min_users ?? 5} people, so the number stays hidden.
      </p>
      <div className="gc-admin-stats-toolbar">
        <Button size="sm" variant="secondary" loading={loading} onClick={load}>Refresh</Button>
        {report?.generated_at && (
          <span>Updated {new Date(report.generated_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
        )}
      </div>

      {error ? (
        <section className="gc-portal-section" role="alert">
          <h2>{notSetUp ? 'Not set up yet' : 'Couldn’t load the stats'}</h2>
          <p className="gc-portal-page__subtitle">
            {notSetUp
              ? 'Run supabase/migrations/20261106200000_song_stats_admin_dashboard.sql in the Supabase SQL editor.'
              : error.message}
          </p>
        </section>
      ) : report ? (
        renderReport(report)
      ) : loading ? (
        <p className="gc-portal-empty">Loading…</p>
      ) : null}
    </div>
  )
}
