import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import SpritePicker from '../components/ui/SpritePicker'
import SpriteAvatar from '../components/ui/SpriteAvatar'
import CollaboratorRequest from '../components/CollaboratorRequest'
import { showToast } from '../utils/app/toast'
// src/data/index.json is deprecated as a songs source; starred songs are now joined from Supabase.

export default function ProfilePage() {
  const { session, profile, loading, isLoggedIn, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [sprite, setSprite] = useState(null)
  const [saving, setSaving] = useState(false)

  // Each item: { song_id: UUID, songs: { slug, title, default_key, artist } }
  const [starredItems, setStarredItems] = useState([])
  const [starsLoading, setStarsLoading] = useState(true)

  const [pendingRequest, setPendingRequest] = useState(false)
  const [contributorRequestsEnabled, setContributorRequestsEnabled] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestNote, setRequestNote] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !isLoggedIn) {
      navigate('/login?redirect=/profile', { replace: true })
    }
  }, [isLoggedIn, loading])

  // Sync form state from profile
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setSprite(profile.preferences?.sprite || null)
    }
  }, [profile])

  // Fetch stars + contributor request status
  useEffect(() => {
    if (!session) return

    // Join with songs to get slug, title, key, artist in one query.
    supabase
      .from('user_starred_songs')
      .select('song_id, songs!inner(slug, title, default_key, artist)')
      .eq('user_id', session.user.id)
      .order('songs(title)')
      .then(({ data, error }) => {
        if (error) console.error('[ProfilePage] Failed to load starred songs:', error)
        setStarredItems(data || [])
        setStarsLoading(false)
      })

    Promise.all([
      supabase.from('system_settings').select('contributor_requests_enabled').single(),
      supabase
        .from('contributor_requests')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('status', 'pending')
        .maybeSingle(),
    ]).then(([settingsRes, requestRes]) => {
      setContributorRequestsEnabled(settingsRes.data?.contributor_requests_enabled ?? false)
      setPendingRequest(!!requestRes.data)
    })
  }, [session])

  async function saveProfile() {
    setSaving(true)
    const { error } = await supabase
      .from('users')
      .update({
        display_name: displayName,
        preferences: { ...(profile?.preferences || {}), sprite },
      })
      .eq('id', session.user.id)
    if (error) showToast('Failed to save profile.')
    else {
      await refreshProfile()
      showToast('Profile saved.')
    }
    setSaving(false)
  }

  async function unstarSong(songId) {
    // songId is the UUID from songs.id
    const removed = starredItems.find(item => item.song_id === songId)
    setStarredItems(prev => prev.filter(item => item.song_id !== songId))
    const { error } = await supabase
      .from('user_starred_songs')
      .delete()
      .eq('user_id', session.user.id)
      .eq('song_id', songId)
    if (error) {
      console.error('[ProfilePage] Failed to unstar song:', error)
      showToast('Could not remove star. Please try again.')
      if (removed) setStarredItems(prev => [...prev, removed]) // revert on error
    }
  }

  async function submitContributorRequest() {
    setSubmittingRequest(true)
    const { error } = await supabase.from('contributor_requests').insert({
      user_id: session.user.id,
      note: requestNote || null,
      status: 'pending',
    })
    if (error) showToast('Failed to submit request.')
    else {
      setPendingRequest(true)
      setShowRequestModal(false)
      setRequestNote('')
      showToast('Contributor request submitted.')
    }
    setSubmittingRequest(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  async function deleteAccount() {
    setDeleteError('')
    setDeleting(true)
    // Verify password before deletion
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: deletePassword,
    })
    if (authError) {
      setDeleteError('Incorrect password. Please try again.')
      setDeleting(false)
      return
    }
    // Delete account via RPC (SECURITY DEFINER function removes from auth.users + cascades)
    const { error: deleteError } = await supabase.rpc('delete_user')
    if (deleteError) {
      setDeleteError('Failed to delete account. Please try again.')
      setDeleting(false)
      return
    }
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading || !profile) {
    return (
      <div className="container">
        <p style={{ padding: '32px 0', color: 'var(--gc-text-secondary)' }}>Loading…</p>
      </div>
    )
  }

  const currentSprite = sprite || 'music-note'
  const roleBadge = profile.global_role || profile.role
  const showContributorRequestBtn = !roleBadge && contributorRequestsEnabled && !pendingRequest

  return (
    <div className="container">
      <Helmet><title>Profile – GraceChords</title></Helmet>

      {/* Profile header */}
      <div className="gc-profile-header">
        <SpriteAvatar sprite={currentSprite} size="lg" />
        <div>
          <h1 style={{ margin: 0 }}>{profile.display_name || 'Your Profile'}</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)' }}>
            {session.user.email}
          </p>
        </div>
      </div>

      {/* Identity section */}
      <section className="gc-profile-section">
        <h2>Identity</h2>
        <div className="gc-form-field">
          <label htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
        </div>
        <div className="gc-form-field">
          <label>Email</label>
          <input type="email" value={session.user.email} disabled readOnly />
        </div>
        <div className="gc-form-field">
          <label>Your icon</label>
          <SpritePicker value={sprite} onChange={setSprite} />
        </div>
        <button
          className="gc-btn gc-btn--primary"
          onClick={saveProfile}
          disabled={saving}
          style={{ width: 'fit-content' }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </section>

      {/* Starred songs section */}
      <section className="gc-profile-section">
        <h2>Starred Songs</h2>
        {starsLoading ? (
          <p style={{ color: 'var(--gc-text-secondary)' }}>Loading…</p>
        ) : starredItems.length === 0 ? (
          <p style={{ color: 'var(--gc-text-secondary)' }}>
            No starred songs yet. Star songs from the song page to find them here.
          </p>
        ) : (
          <div className="gc-starred-list">
            {starredItems.map(item => {
              const { song_id, songs: song } = item
              return (
                <div key={song_id} className="gc-starred-row">
                  <Link to={`/songs/${song?.slug || song_id}`} className="gc-starred-row__info">
                    <span className="gc-starred-row__title">{song?.title || song_id}</span>
                    {song?.default_key && <span className="gc-starred-row__key">{song.default_key}</span>}
                    {song?.artist && <span className="gc-starred-row__artist">{song.artist}</span>}
                  </Link>
                  <button
                    className="gc-btn gc-btn--ghost gc-btn--sm"
                    onClick={() => unstarSong(song_id)}
                    aria-label={`Unstar ${song?.title || song_id}`}
                  >
                    Unstar
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Account section */}
      <section className="gc-profile-section">
        <h2>Account</h2>
        {roleBadge && (
          <div className="gc-role-badge">
            {roleBadge.charAt(0).toUpperCase() + roleBadge.slice(1)}
          </div>
        )}
        <CollaboratorRequest />
        {showContributorRequestBtn && (
          <button
            className="gc-btn gc-btn--secondary"
            onClick={() => setShowRequestModal(true)}
            style={{ width: 'fit-content' }}
          >
            Request Contributor Access
          </button>
        )}
        {pendingRequest && !roleBadge && (
          <button className="gc-btn gc-btn--secondary" disabled style={{ width: 'fit-content' }}>
            Request pending
          </button>
        )}
        <button
          className="gc-btn gc-btn--ghost"
          onClick={signOut}
          style={{ width: 'fit-content', marginTop: 8 }}
        >
          Sign out
        </button>

        <div className="gc-danger-zone">
          <div>
            <p className="gc-danger-zone__label">Delete account</p>
            <p className="gc-danger-zone__description">
              Permanently remove your account and all associated data. This cannot be undone.
            </p>
          </div>
          <button
            className="gc-btn gc-btn--danger"
            onClick={() => { setDeletePassword(''); setDeleteError(''); setShowDeleteModal(true) }}
            style={{ width: 'fit-content', flexShrink: 0 }}
          >
            Delete account
          </button>
        </div>
      </section>

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="gc-modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="gc-modal" onClick={e => e.stopPropagation()}>
            <h2>Delete account</h2>
            <p style={{ margin: 0, color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)' }}>
              This will permanently delete your account and all your data, including starred songs
              and any contributor requests. <strong style={{ color: 'var(--gc-danger)' }}>This cannot be undone.</strong>
            </p>
            <div className="gc-form-field">
              <label htmlFor="deletePassword">Confirm your password</label>
              <input
                id="deletePassword"
                type="password"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={deleting}
              />
            </div>
            {deleteError && (
              <p className="gc-auth-error" style={{ margin: 0 }}>{deleteError}</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="gc-btn gc-btn--danger"
                onClick={deleteAccount}
                disabled={deleting || !deletePassword}
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
              <button
                className="gc-btn gc-btn--ghost"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contributor request modal */}
      {showRequestModal && (
        <div className="gc-modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="gc-modal" onClick={e => e.stopPropagation()}>
            <h2>Request Contributor Access</h2>
            <p style={{ margin: 0, color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)' }}>
              Contributors can submit songs and content to GraceChords.
            </p>
            <div className="gc-form-field">
              <label htmlFor="requestNote">Why do you want to contribute? (optional)</label>
              <textarea
                id="requestNote"
                value={requestNote}
                onChange={e => setRequestNote(e.target.value)}
                rows={4}
                placeholder="Tell us a bit about yourself…"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="gc-btn gc-btn--primary"
                onClick={submitContributorRequest}
                disabled={submittingRequest}
              >
                {submittingRequest ? 'Submitting…' : 'Submit request'}
              </button>
              <button
                className="gc-btn gc-btn--ghost"
                onClick={() => setShowRequestModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
