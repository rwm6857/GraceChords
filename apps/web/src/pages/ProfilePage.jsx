import React, { useCallback, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import SpriteAvatar from '../components/ui/SpriteAvatar'
import TelegramLoginButton from '../components/TelegramLoginButton'
import { showToast } from '../utils/app/toast'
import { hasPassword, songStatsEnabledFromPreferences } from '@gracechords/core'
import SecuritySection from '../components/profile/SecuritySection'
import IconPickerModal from '../components/profile/IconPickerModal'
import { LogOutIcon, PencilIcon } from '../components/Icons'
import { countFeatureUse, setSongStatsEnabled, songStats } from '../lib/songStats'
import '../styles/settings.css'

export default function ProfilePage() {
  const { t } = useTranslation('profile')
  const { t: tc } = useTranslation('common')
  const { t: ts } = useTranslation('stats')
  const { session, profile, loading, isLoggedIn, refreshProfile, role, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [displayName, setDisplayName] = useState('')
  const [sprite, setSprite] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [savingIcon, setSavingIcon] = useState(false)

  // Song Stats opt-out lives in users.preferences; null = follow the profile.
  const [songStatsOverride, setSongStatsOverride] = useState(null)
  const [songStatsBusy, setSongStatsBusy] = useState(false)
  const songStatsOn = songStatsOverride ?? songStatsEnabledFromPreferences(profile?.preferences)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Whether this account can sign in with an email + password. OAuth-only
  // accounts (Google / Apple) that never set a password have none to confirm,
  // so the delete flow falls back to a typed confirmation for them.
  const hasPasswordLogin = hasPassword(session?.user)

  // Telegram link state
  const [telegramState, setTelegramState] = useState({ linked: false, telegram_user_id: null, telegram_linked_at: null })
  const [telegramLoading, setTelegramLoading] = useState(true)
  const [telegramBusy, setTelegramBusy] = useState(false)

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !isLoggedIn) {
      navigate('/login?redirect=/profile', { replace: true })
    }
  }, [isLoggedIn, loading, navigate])

  // Scroll to anchor when the route hash points at a section on this page
  // (e.g. /profile#telegram from the "Link your Telegram" dialog).
  useEffect(() => {
    if (loading) return
    const hash = (location.hash || '').replace(/^#/, '')
    if (!hash) return
    const el = document.getElementById(hash)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, location.hash])

  // Sync form state from profile
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setSprite(profile.preferences?.sprite || null)
    }
  }, [profile])

  async function saveProfile() {
    setSaving(true)
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName })
      .eq('id', session.user.id)
    if (error) showToast(t('saveFailed'))
    else {
      await refreshProfile()
      showToast('Profile saved.')
    }
    setSaving(false)
  }

  async function saveIcon(id) {
    setSavingIcon(true)
    const { error } = await supabase
      .from('users')
      .update({ preferences: { ...(profile?.preferences || {}), sprite: id } })
      .eq('id', session.user.id)
    setSavingIcon(false)
    if (error) {
      showToast('Could not update your icon. Please try again.')
      return
    }
    setSprite(id)
    setShowIconPicker(false)
    await refreshProfile()
  }

  const closeIconPicker = useCallback(() => setShowIconPicker(false), [])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  // Fetch current Telegram link state once logged in.
  useEffect(() => {
    if (!session) return
    let cancelled = false
    setTelegramLoading(true)
    fetch('/api/telegram/link', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setTelegramState({
          linked: !!data.linked,
          telegram_user_id: data.telegram_user_id || null,
          telegram_linked_at: data.telegram_linked_at || null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setTelegramState({ linked: false, telegram_user_id: null, telegram_linked_at: null })
      })
      .finally(() => {
        if (!cancelled) setTelegramLoading(false)
      })
    return () => { cancelled = true }
  }, [session])

  async function handleTelegramAuth(user) {
    if (!session) return
    setTelegramBusy(true)
    try {
      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(user),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data?.error || 'Could not link Telegram. Try again.')
        return
      }
      setTelegramState({
        linked: true,
        telegram_user_id: data.telegram_user_id,
        telegram_linked_at: data.telegram_linked_at,
      })
      showToast('Telegram linked.')
      countFeatureUse('telegram_link')
    } catch {
      showToast('Could not link Telegram. Try again.')
    } finally {
      setTelegramBusy(false)
    }
  }

  async function unlinkTelegram() {
    if (!session) return
    setTelegramBusy(true)
    try {
      const res = await fetch('/api/telegram/link', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        showToast('Could not unlink. Try again.')
        return
      }
      setTelegramState({ linked: false, telegram_user_id: null, telegram_linked_at: null })
      showToast('Telegram unlinked.')
    } catch {
      showToast('Could not unlink. Try again.')
    } finally {
      setTelegramBusy(false)
    }
  }

  async function onToggleSongStats(enabled) {
    if (songStatsBusy) return
    if (!enabled && !window.confirm(tc('songStats.offConfirm'))) return
    setSongStatsBusy(true)
    try {
      await setSongStatsEnabled(enabled)
      setSongStatsOverride(enabled)
      refreshProfile?.()
    } catch (err) {
      console.error('[ProfilePage] song stats toggle:', err)
      showToast(tc('songStats.toggleFailed'))
    } finally {
      setSongStatsBusy(false)
    }
  }

  async function onClearSongStats() {
    if (songStatsBusy || !window.confirm(tc('songStats.clearConfirm'))) return
    setSongStatsBusy(true)
    try {
      await songStats.clearHistory()
      showToast(tc('songStats.cleared'))
    } catch (err) {
      console.error('[ProfilePage] clear song stats:', err)
      showToast(tc('songStats.clearFailed'))
    } finally {
      setSongStatsBusy(false)
    }
  }

  async function deleteAccount() {
    setDeleteError('')
    setDeleting(true)
    // Verify password before deletion for password accounts. OAuth-only accounts
    // have no password, so the modal requires typing "DELETE" instead.
    if (hasPasswordLogin) {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: deletePassword,
      })
      if (authError) {
        setDeleteError('Incorrect password. Please try again.')
        setDeleting(false)
        return
      }
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

  const roleBadge = role && role !== 'user' ? role : null

  return (
    <div className="container">
      <Helmet><title>Profile – GraceChords</title></Helmet>

      {/* Profile header */}
      <div className="gc-profile-header">
        <button
          type="button"
          className="gc-profile-avatar"
          onClick={() => setShowIconPicker(true)}
          aria-label="Change your icon"
        >
          <SpriteAvatar sprite={sprite} size="lg" />
          <span className="gc-profile-avatar__edit" aria-hidden="true">
            <PencilIcon />
          </span>
        </button>
        <div className="gc-profile-header__info">
          <div className="gc-profile-header__name">
            <h1>{profile.display_name || 'Your Profile'}</h1>
            {roleBadge && (
              <span className="gc-role-badge">
                {roleBadge.charAt(0).toUpperCase() + roleBadge.slice(1)}
              </span>
            )}
          </div>
          <p className="gc-profile-header__email">{session.user.email}</p>
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
        <button
          className="gc-btn gc-btn--primary"
          onClick={saveProfile}
          disabled={saving}
          style={{ width: 'fit-content' }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </section>

      <SecuritySection user={session.user} />

      {/* Telegram section */}
      <section id="telegram" className="gc-profile-section">
        <h2>Telegram</h2>
        <p style={{ margin: 0, color: 'var(--gc-text-secondary)' }}>
          Link your account to <strong>@gracechords_bot</strong> on Telegram so you can DM the bot a song title (or a comma-separated setlist) and get chord charts back instantly.
        </p>
        {telegramLoading ? (
          <p style={{ color: 'var(--gc-text-secondary)' }}>Checking link status…</p>
        ) : telegramState.linked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div className="gc-role-badge">
              Linked
              {telegramState.telegram_linked_at && (
                <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.7 }}>
                  · {new Date(telegramState.telegram_linked_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <button
              className="gc-btn gc-btn--ghost gc-btn--sm"
              onClick={unlinkTelegram}
              disabled={telegramBusy}
              style={{ width: 'fit-content' }}
            >
              {telegramBusy ? 'Unlinking…' : 'Unlink'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <TelegramLoginButton onAuth={handleTelegramAuth} disabled={telegramBusy} />
            {telegramBusy && (
              <p style={{ color: 'var(--gc-text-secondary)' }}>Linking your Telegram account…</p>
            )}
          </div>
        )}
      </section>

      {/* Song Stats — the controls, plus the secondary way in to the stats
          (the primary one is the card on the setlists rail). */}
      <section id="song-stats" className="gc-profile-section">
        <h2>{tc('songStats.title')}</h2>
        <p style={{ margin: 0, color: 'var(--gc-text-secondary)' }}>{tc('songStats.hint')}</p>
        <Link to="/song-stats" style={{ width: 'fit-content' }}>{ts('view')}</Link>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: 'fit-content' }}>
          <input
            type="checkbox"
            checked={songStatsOn}
            disabled={songStatsBusy}
            onChange={(e) => onToggleSongStats(e.target.checked)}
          />
          {tc('songStats.collect')}
        </label>
        <button
          className="gc-btn gc-btn--ghost gc-btn--sm"
          onClick={onClearSongStats}
          disabled={songStatsBusy}
          style={{ width: 'fit-content' }}
        >
          {tc('songStats.clear')}
        </button>
      </section>

      {/* Account section */}
      <section className="gc-profile-section">
        <h2>Account</h2>
        <div className="gc-profile-account-actions">
          <button className="gc-btn gc-btn--secondary gc-profile-signout" onClick={signOut}>
            <LogOutIcon />
            Sign out
          </button>
          {isAdmin && (
            <Link to="/admin" className="gc-btn gc-btn--ghost">
              Admin Portal →
            </Link>
          )}
        </div>

        <div className="gc-danger-zone">
          <div>
            <p className="gc-danger-zone__label">Delete account</p>
            <p className="gc-danger-zone__description">
              Permanently remove your account and all associated data. This cannot be undone.
            </p>
          </div>
          <button
            className="gc-btn gc-btn--danger"
            onClick={() => { setDeletePassword(''); setDeleteConfirmText(''); setDeleteError(''); setShowDeleteModal(true) }}
            style={{ width: 'fit-content', flexShrink: 0 }}
          >
            Delete account
          </button>
        </div>
      </section>

      <IconPickerModal
        open={showIconPicker}
        value={sprite}
        saving={savingIcon}
        onSelect={saveIcon}
        onClose={closeIconPicker}
      />

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="gc-modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="gc-modal" onClick={e => e.stopPropagation()}>
            <h2>Delete account</h2>
            <p style={{ margin: 0, color: 'var(--gc-text-secondary)', fontSize: 'var(--gc-font-sub)' }}>
              This will permanently delete your account and all your data, including starred songs,
              setlists and reflections. <strong style={{ color: 'var(--gc-danger)' }}>This cannot be undone.</strong>
            </p>
            {hasPasswordLogin ? (
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
            ) : (
              <div className="gc-form-field">
                <label htmlFor="deleteConfirmText">Type DELETE to confirm</label>
                <input
                  id="deleteConfirmText"
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => { setDeleteConfirmText(e.target.value); setDeleteError('') }}
                  placeholder="DELETE"
                  autoComplete="off"
                  disabled={deleting}
                />
              </div>
            )}
            {deleteError && (
              <p className="gc-auth-error" style={{ margin: 0 }}>{deleteError}</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="gc-btn gc-btn--danger"
                onClick={deleteAccount}
                disabled={
                  deleting ||
                  (hasPasswordLogin
                    ? !deletePassword
                    : deleteConfirmText.trim().toUpperCase() !== 'DELETE')
                }
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

    </div>
  )
}
