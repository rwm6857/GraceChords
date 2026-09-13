import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { timeAgo } from '@gracechords/core'
import { Button } from '../../components/ui/layout-kit'
import { songCountLabel } from './songCountLabel'
import { DuplicateIcon, EllipsisIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/Icons'

// The user's setlists, always on screen at desktop width so switching sets is
// one click and never a page navigation. Below the split breakpoint the same
// component renders as the standalone /setlists list.
export default function SetlistsRail({
  setlists,
  loading,
  error,
  currentId,
  limit,
  atLimit,
  isLoggedIn,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onRetry,
}) {
  const { t } = useTranslation(['pages', 'common'])
  const [menuFor, setMenuFor] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const railRef = useRef(null)

  useEffect(() => {
    if (!menuFor) return undefined
    function onAway(e) {
      if (railRef.current && !railRef.current.contains(e.target)) setMenuFor(null)
    }
    document.addEventListener('mousedown', onAway)
    return () => document.removeEventListener('mousedown', onAway)
  }, [menuFor])

  if (!isLoggedIn) {
    return (
      <nav
        className="gc-rail gc-rail--setlists"
        ref={railRef}
        aria-label={t('setlist.savedSets')}
      >
        <div className="gc-rail-head">{t('setlist.savedSets')}</div>
        <div className="gc-signin-card">
          <h3>{t('setlist.signInTitle')}</h3>
          <p>{t('setlist.signInBody')}</p>
          <Button as={Link} to="/login" variant="primary" size="sm" fullWidth>
            {t('setlist.signIn')}
          </Button>
        </div>
      </nav>
    )
  }

  function commitRename(id) {
    const next = draft.trim()
    setRenamingId(null)
    if (next) onRename(id, next)
  }

  return (
    <nav
      className="gc-rail gc-rail--setlists"
      ref={railRef}
      aria-label={t('setlist.savedSets')}
    >
      <div className="gc-rail-head">{t('setlist.savedSets')}</div>
      <div className="gc-rail-controls">
        <Button variant="primary" size="sm" fullWidth iconLeft={<PlusIcon />} onClick={onCreate}>
          {t('setlist.newSet')}
        </Button>
      </div>

      <div className="gc-rail-body">
        {loading ? (
          <p className="gc-rail-note">{t('setlist.loading')}</p>
        ) : error ? (
          <p className="gc-rail-note">
            {t('setlist.failedLoad')}{' '}
            <button type="button" className="gc-linkbtn" onClick={onRetry}>
              {t('setlist.retry')}
            </button>
          </p>
        ) : setlists.length === 0 ? (
          <p className="gc-rail-note">{t('setlist.noSavedSets')}</p>
        ) : (
          setlists.map((s) => {
            const edited = timeAgo(s.updated_at, (k, o) => t(`common:${k}`, o))
            const isCurrent = s.id === currentId
            return (
              <div key={s.id} className={`gc-setrow${isCurrent ? ' is-current' : ''}`}>
                {renamingId === s.id ? (
                  <input
                    className="gc-setrow-input"
                    id={`gc-rename-${s.id}`}
                    value={draft}
                    aria-label={t('setlist.fieldName')}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitRename(s.id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setRenamingId(null)
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="gc-setrow-open"
                    aria-current={isCurrent ? 'true' : 'false'}
                    onClick={() => onOpen(s.id)}
                  >
                    <span className="gc-setrow-name">{s.name}</span>
                    <span className="gc-setrow-meta">
                      {songCountLabel(t, s.songCount)}
                      {edited ? ` · ${edited}` : ''}
                    </span>
                  </button>
                )}

                <div className="gc-setrow-menu">
                  <button
                    type="button"
                    className="gc-icon-action"
                    aria-label={t('setlist.setActionsFor', { name: s.name })}
                    aria-expanded={menuFor === s.id}
                    onClick={() => setMenuFor((id) => (id === s.id ? null : s.id))}
                  >
                    <EllipsisIcon />
                  </button>
                  {menuFor === s.id ? (
                    <div className="gc-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="gc-menu-item"
                        onClick={() => {
                          setMenuFor(null)
                          setDraft(s.name)
                          setRenamingId(s.id)
                        }}
                      >
                        <PencilIcon /> {t('setlist.rename')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="gc-menu-item"
                        onClick={() => {
                          setMenuFor(null)
                          onDuplicate(s.id)
                        }}
                      >
                        <DuplicateIcon /> {t('setlist.duplicateSet')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="gc-menu-item is-danger"
                        onClick={() => {
                          setMenuFor(null)
                          setConfirmId(s.id)
                        }}
                      >
                        <TrashIcon /> {t('setlist.deleteSet')}
                      </button>
                    </div>
                  ) : null}
                </div>

                {confirmId === s.id ? (
                  <div className="gc-setrow-confirm">
                    <span>{t('setlist.deletePrompt')}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setConfirmId(null)
                        onDelete(s.id)
                      }}
                    >
                      {t('setlist.yes')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmId(null)}>
                      {t('setlist.no')}
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div className="gc-rail-foot" title={t('setlist.savedSetsLimitTooltip')}>
        {Number.isFinite(limit)
          ? t('setlist.usageCount', { count: setlists.length, limit })
          : t('setlist.usageCountUnlimited', { count: setlists.length })}
        {atLimit ? <span className="gc-rail-foot-warn"> · {t('setlist.atLimit')}</span> : null}
      </div>
    </nav>
  )
}
