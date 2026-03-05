import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import SpritePicker from '../components/ui/SpritePicker'
import SpriteAvatar from '../components/ui/SpriteAvatar'
import { showToast } from '../utils/app/toast'
import indexData from '../data/index.json'

export default function ProfilePage() {
  const { session, profile, loading, isLoggedIn, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [sprite, setSprite] = useState(null)
  const [saving, setSaving] = useState(false)

  const [starredSongIds, setStarredSongIds] = useState([])
  const [starsLoading, setStarsLoading] = useState(true)

  const [pendingRequest, setPendingRequest] = useState(false)
  const [contributorRequestsEnabled, setContributorRequestsEnabled] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestNote, setRequestNote] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)

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

    supabase
      .from('user_starred_songs')
      .select('song_id')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        setStarredSongIds((data || []).map(r => r.song_id))
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
    setStarredSongIds(prev => prev.filter(id => id !== songId))
    await supabase
      .from('user_starred_songs')
      .delete()
      .eq('user_id', session.user.id)
      .eq('song_id', songId)
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

  if (loading || !profile) {
    return (
      <div className="container">
        <p style={{ padding: '32px 0', color: 'var(--gc-text-secondary)' }}>Loading…</p>
      </div>
    )
  }

  const currentSprite = sprite || 'music-note'
  const roleBadge = profile.global_role
  const showContributorRequestBtn = !roleBadge && contributorRequestsEnabled && !pendingRequest
  const songCatalog = indexData?.items || []

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
        ) : starredSongIds.length === 0 ? (
          <p style={{ color: 'var(--gc-text-secondary)' }}>
            No starred songs yet. Star songs from the song page to find them here.
          </p>
        ) : (
          <div className="gc-starred-list">
            {starredSongIds.map(songId => {
              const song = songCatalog.find(s => s.id === songId)
              return (
                <div key={songId} className="gc-starred-row">
                  <Link to={`/songs/${songId}`} className="gc-starred-row__info">
                    <span className="gc-starred-row__title">{song?.title || songId}</span>
                    {song?.key && <span className="gc-starred-row__key">{song.key}</span>}
                    {song?.artist && <span className="gc-starred-row__artist">{song.artist}</span>}
                  </Link>
                  <button
                    className="gc-btn gc-btn--ghost gc-btn--sm"
                    onClick={() => unstarSong(songId)}
                    aria-label={`Unstar ${song?.title || songId}`}
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
      </section>

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
