import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../hooks/useRole'
import { showToast } from '../../utils/app/toast'

const PAGE_SIZE = 20
const ALL_ACTIONS = ['direct_save', 'suggestion_submitted', 'approved', 'rejected', 'deleted', 'touched_up']

function formatDate(str) {
  if (!str) return ''
  try { return new Date(str).toLocaleString() } catch { return str }
}

export default function AuditLogPanel() {
  const { isAtLeast } = useRole()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [filterAction, setFilterAction] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [expandedRows, setExpandedRows] = useState(new Set())

  const fetchEntries = useCallback(async () => {
    if (!isAtLeast('admin')) return
    setLoading(true)
    setError(null)

    let query = supabase
      .from('editor_audit_log')
      .select('*, users(display_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterAction) query = query.eq('action', filterAction)
    if (filterDateFrom) query = query.gte('created_at', filterDateFrom)
    if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59')

    const { data, error: fetchError, count } = await query

    if (fetchError) {
      setError(fetchError.message)
      showToast(`Audit log error: ${fetchError.message}`)
    } else {
      setEntries(data || [])
      setTotalCount(count || 0)
    }
    setLoading(false)
  }, [isAtLeast, page, filterAction, filterDateFrom, filterDateTo])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  if (!isAtLeast('admin')) return null

  function toggleExpand(id) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="gc-audit-log gc-portal-section">
      <h2>Audit Log</h2>

      {/* Filters */}
      <div className="gc-audit-log__filters">
        <select
          className="gc-audit-log__filter-select"
          value={filterAction}
          onChange={e => { setFilterAction(e.target.value); setPage(0) }}
        >
          <option value="">All actions</option>
          {ALL_ACTIONS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          className="gc-audit-log__filter-input"
          type="date"
          value={filterDateFrom}
          onChange={e => { setFilterDateFrom(e.target.value); setPage(0) }}
          title="From date"
        />
        <input
          className="gc-audit-log__filter-input"
          type="date"
          value={filterDateTo}
          onChange={e => { setFilterDateTo(e.target.value); setPage(0) }}
          title="To date"
        />
        <button
          type="button"
          className="gc-btn gc-btn--secondary gc-btn--sm"
          onClick={() => { setFilterAction(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(0) }}
        >
          Clear
        </button>
      </div>

      {error && <p style={{ color: 'var(--gc-danger)' }}>Error: {error}</p>}
      {loading && <p style={{ color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)' }}>Loading…</p>}

      {!loading && !error && (
        <div className="gc-audit-log__table-wrap">
          <table className="gc-audit-log__table">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Action</th>
                <th>Song</th>
                <th>When</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gc-text-secondary)' }}>
                    No entries found.
                  </td>
                </tr>
              )}
              {entries.map(entry => (
                <React.Fragment key={entry.id}>
                  <tr>
                    <td>{entry.users?.display_name || entry.actor_id?.slice(0, 8) || '—'}</td>
                    <td>
                      <span className={`gc-audit-log__action-badge gc-audit-log__action-badge--${entry.action}`}>
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {entry.song_slug ? (
                        <Link to={`/songs/${entry.song_slug}`} style={{ color: 'var(--gc-link)' }}>
                          {entry.song_title || entry.song_slug}
                        </Link>
                      ) : (
                        entry.song_title || '—'
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.created_at)}</td>
                    <td style={{ color: 'var(--gc-text-secondary)' }}>{entry.note || '—'}</td>
                    <td>
                      {entry.payload_snapshot && (
                        <button
                          type="button"
                          className="gc-audit-log__expand-btn"
                          onClick={() => toggleExpand(entry.id)}
                        >
                          {expandedRows.has(entry.id) ? '▲ Hide' : '▼ Show'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedRows.has(entry.id) && entry.payload_snapshot && (
                    <tr>
                      <td colSpan={6}>
                        <pre className="gc-audit-log__payload">
                          {JSON.stringify(entry.payload_snapshot, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="gc-audit-log__pagination">
          <span>
            Page {page + 1} of {totalPages} ({totalCount} entries)
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="gc-btn gc-btn--secondary gc-btn--sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              ← Prev
            </button>
            <button
              type="button"
              className="gc-btn gc-btn--secondary gc-btn--sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
