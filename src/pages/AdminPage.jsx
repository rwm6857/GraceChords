import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { showToast } from '../utils/app/toast'

const ALL_ROLES = ['owner', 'admin', 'editor', 'collaborator', 'user']

function RolePill({ role }) {
  return (
    <span className={`gc-role-pill gc-role-pill--${role}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}

function formatAccountAge(createdAt) {
  if (!createdAt) return '—'
  const ms = Date.now() - new Date(createdAt).getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 1) return 'Today'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month'
  if (months < 12) return `${months} months`
  const years = Math.floor(months / 12)
  return years === 1 ? '1 year' : `${years} years`
}

// Role matrix data
const MATRIX_ROWS = [
  { label: 'View public site',               user: true,  collab: true,  editor: true,  admin: true,  owner: true  },
  { label: 'Star songs / personal features', user: true,  collab: true,  editor: true,  admin: true,  owner: true  },
  { label: 'Suggest song edits/additions',   user: false, collab: true,  editor: true,  admin: true,  owner: true  },
  { label: 'Add/edit songs & posts directly',user: false, collab: false, editor: true,  admin: true,  owner: true  },
  { label: 'Approve/reject suggestions',     user: false, collab: false, editor: true,  admin: true,  owner: true  },
  { label: 'Request deletion',               user: false, collab: false, editor: true,  admin: true,  owner: true  },
  { label: 'Delete songs & posts',           user: false, collab: false, editor: false, admin: true,  owner: true  },
  { label: 'Promote users to Collaborator',  user: false, collab: false, editor: false, admin: true,  owner: true  },
  { label: 'Promote Collaborators to Editor',user: false, collab: false, editor: false, admin: true,  owner: true  },
  { label: 'Promote users to Admin',         user: false, collab: false, editor: false, admin: false, owner: true  },
  { label: 'Delete user accounts',           user: false, collab: false, editor: false, admin: false, owner: true  },
  { label: 'Access Admin Portal',            user: false, collab: false, editor: false, admin: true,  owner: true  },
  { label: 'Access Editor Portal',           user: false, collab: false, editor: true,  admin: true,  owner: true  },
]

export default function AdminPage() {
  const { session, role: currentRole, isOwner } = useAuth()
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [pendingRequests, setPendingRequests] = useState([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [changingRole, setChangingRole] = useState({}) // { userId: true }

  useEffect(() => {
    loadUsers()
    loadPendingRequests()
  }, [])

  async function loadUsers() {
    setUsersLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('id, role, account_created_at, display_name')
      .order('account_created_at', { ascending: false })
    if (error) {
      showToast('Failed to load users.')
      console.error('[AdminPage] loadUsers:', error)
    } else {
      setUsers(data || [])
    }
    setUsersLoading(false)
  }

  async function loadPendingRequests() {
    setPendingLoading(true)
    const { data, error } = await supabase
      .from('collaborator_requests')
      .select('id, user_id, requested_at, users(display_name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
    if (error) {
      if (error.code !== '42P01') { // 42P01 = table doesn't exist yet
        console.error('[AdminPage] loadPendingRequests:', error)
      }
      setPendingRequests([])
    } else {
      setPendingRequests(data || [])
    }
    setPendingLoading(false)
  }

  function getAvailableRoles(targetRole) {
    if (isOwner) return ALL_ROLES
    // Admins can set editor, collaborator, user only
    return ['editor', 'collaborator', 'user']
  }

  async function handleRoleChange(userId, newRole) {
    if (!userId || !newRole) return
    setChangingRole(prev => ({ ...prev, [userId]: true }))
    const { error } = await supabase.rpc('update_user_role', {
      target_user_id: userId,
      new_role: newRole,
    })
    if (error) {
      showToast(`Failed to update role: ${error.message}`)
      console.error('[AdminPage] handleRoleChange:', error)
    } else {
      showToast('Role updated.')
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    }
    setChangingRole(prev => ({ ...prev, [userId]: false }))
  }

  async function handleApproveRequest(req) {
    const { error } = await supabase.rpc('update_user_role', {
      target_user_id: req.user_id,
      new_role: 'collaborator',
    })
    if (error) {
      showToast(`Failed to approve: ${error.message}`)
      return
    }
    await supabase
      .from('collaborator_requests')
      .update({ status: 'approved' })
      .eq('id', req.id)
    showToast('Collaborator access granted.')
    setPendingRequests(prev => prev.filter(r => r.id !== req.id))
    setUsers(prev => prev.map(u => u.id === req.user_id ? { ...u, role: 'collaborator' } : u))
  }

  async function handleDenyRequest(req) {
    const { error } = await supabase
      .from('collaborator_requests')
      .update({ status: 'denied' })
      .eq('id', req.id)
    if (error) {
      showToast('Failed to deny request.')
      return
    }
    showToast('Request denied.')
    setPendingRequests(prev => prev.filter(r => r.id !== req.id))
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.rpc('admin_delete_user', {
      target_user_id: deleteTarget.id,
    })
    if (error) {
      showToast(`Failed to delete user: ${error.message}`)
      console.error('[AdminPage] handleDeleteUser:', error)
    } else {
      showToast(`${deleteTarget.display_name || deleteTarget.email || 'User'} deleted.`)
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const currentUserId = session?.user?.id

  return (
    <div className="gc-portal-page container">
      <Helmet><title>Admin Portal – GraceChords</title></Helmet>

      <h1>Admin Portal</h1>
      <p className="gc-portal-page__subtitle">
        Manage users, roles, and pending access requests.
      </p>

      {/* ── 4a. User Management Table ─────────────────────────────── */}
      <section className="gc-portal-section">
        <h2>User Management</h2>
        {usersLoading ? (
          <p className="gc-portal-empty">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="gc-portal-empty">No users found.</p>
        ) : (
          <div className="gc-user-table-wrap">
            <table className="gc-user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Account Age</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isSelf = user.id === currentUserId
                  const isTargetOwner = user.role === 'owner'
                  const canChangeRole = !isSelf && (!isTargetOwner || isOwner)
                  const availableRoles = getAvailableRoles(user.role)
                  const isChanging = !!changingRole[user.id]

                  return (
                    <tr key={user.id}>
                      <td>{user.display_name || <span style={{ color: 'var(--gc-text-tertiary)' }}>—</span>}</td>
                      <td style={{ fontSize: 'var(--gc-font-cap)', color: 'var(--gc-text-secondary)' }}>
                        {user.email || '—'}
                      </td>
                      <td><RolePill role={user.role || 'user'} /></td>
                      <td>
                        <span className="gc-account-age">
                          {formatAccountAge(user.account_created_at)}
                        </span>
                      </td>
                      <td>
                        <div className="gc-user-actions">
                          <select
                            className="gc-role-select"
                            value={user.role || 'user'}
                            disabled={!canChangeRole || isChanging}
                            onChange={e => handleRoleChange(user.id, e.target.value)}
                            aria-label={`Change role for ${user.display_name || user.email}`}
                          >
                            {availableRoles.map(r => (
                              <option key={r} value={r}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                              </option>
                            ))}
                          </select>
                          {isOwner && !isSelf && (
                            <button
                              className="gc-btn gc-btn--danger gc-btn--sm"
                              onClick={() => setDeleteTarget(user)}
                              style={{ fontSize: 'var(--gc-font-cap)', padding: '4px 10px' }}
                            >
                              Delete
                            </button>
                          )}
                          {isSelf && (
                            <span style={{ color: 'var(--gc-text-tertiary)', fontSize: 'var(--gc-font-cap)' }}>
                              (you)
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 4c. Pending Collaborator Requests ─────────────────────── */}
      <section className="gc-portal-section">
        <h2>Pending Collaborator Requests</h2>
        {pendingLoading ? (
          <p className="gc-portal-empty">Loading requests…</p>
        ) : pendingRequests.length === 0 ? (
          <p className="gc-portal-empty">No pending requests.</p>
        ) : (
          <div className="gc-pending-list">
            {pendingRequests.map(req => {
              const prof = req.users
              const name = prof?.display_name || '—'
              const email = '—'
              return (
                <div key={req.id} className="gc-pending-item">
                  <div className="gc-pending-item__info">
                    <div className="gc-pending-item__name">{name}</div>
                    <div className="gc-pending-item__meta">
                      {email} · Requested {formatAccountAge(req.requested_at)} ago
                    </div>
                  </div>
                  <div className="gc-pending-item__actions">
                    <button
                      className="gc-btn gc-btn--primary gc-btn--sm"
                      onClick={() => handleApproveRequest(req)}
                    >
                      Approve
                    </button>
                    <button
                      className="gc-btn gc-btn--ghost gc-btn--sm"
                      onClick={() => handleDenyRequest(req)}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 4b. Role & Privilege Matrix ───────────────────────────── */}
      <section className="gc-portal-section">
        <h2>Role & Privilege Matrix</h2>
        <div className="gc-matrix-wrap">
          <table className="gc-matrix-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th><RolePill role="owner" /></th>
                <th><RolePill role="admin" /></th>
                <th><RolePill role="editor" /></th>
                <th><RolePill role="collaborator" /></th>
                <th><RolePill role="user" /></th>
              </tr>
            </thead>
            <tbody>
              {MATRIX_ROWS.map(row => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td><span className={row.owner ? 'gc-matrix-yes' : 'gc-matrix-no'}>{row.owner ? '✓' : '—'}</span></td>
                  <td><span className={row.admin ? 'gc-matrix-yes' : 'gc-matrix-no'}>{row.admin ? '✓' : '—'}</span></td>
                  <td><span className={row.editor ? 'gc-matrix-yes' : 'gc-matrix-no'}>{row.editor ? '✓' : '—'}</span></td>
                  <td><span className={row.collab ? 'gc-matrix-yes' : 'gc-matrix-no'}>{row.collab ? '✓' : '—'}</span></td>
                  <td><span className={row.user ? 'gc-matrix-yes' : 'gc-matrix-no'}>{row.user ? '✓' : '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Delete confirm dialog ──────────────────────────────────── */}
      {deleteTarget && (
        <div className="gc-confirm-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="gc-confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3>Delete account</h3>
            <p>
              Permanently delete{' '}
              <strong>{deleteTarget.display_name || deleteTarget.email || 'this user'}</strong>
              ? This cannot be undone. All their data will be removed.
            </p>
            <div className="gc-confirm-dialog__actions">
              <button
                className="gc-btn gc-btn--ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="gc-btn gc-btn--danger"
                onClick={handleDeleteUser}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
