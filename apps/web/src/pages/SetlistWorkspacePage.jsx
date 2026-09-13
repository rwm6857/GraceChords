import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createSetlist, isVerseId, uniqueName, updateSetlist } from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSetlistBuilder } from '../hooks/useSetlistBuilder'
import { useDraftSetlist, clearDraft } from '../hooks/useDraftSetlist'
import { usePersonalSetlists } from '../hooks/usePersonalSetlists'
import { useChordStyle } from '../hooks/useSettings'
import { useIsMobile } from '../hooks/useIsMobile'
import { showToast } from '../utils/app/toast'
import { transposeSymPrefer } from '../utils/chordpro'
import { decodeSet } from '../utils/setlists/setcode'
import { effectiveEntryKey } from '../utils/setlists/entries'
import { filterByTag, pickManyRandom, pickRandom } from '../utils/songs/quickActions'
import {
  resolveInitialSongLanguage,
  writeSongLanguagePreference,
} from '../utils/songs/songCatalog'
import PageContainer from '../components/layout/PageContainer'
import '../styles/setlist-workspace.css'
import { Button, Toolbar } from '../components/ui/layout-kit'
import MobilePaneTabs from '../components/ui/mobile/MobilePaneTabs'
import MobileActionSheet from '../components/ui/mobile/MobileActionSheet'
import { ListIcon, MediaIcon, PlusIcon, SearchIcon } from '../components/Icons'
import SetlistsRail from '../features/setlist/SetlistsRail'
import LibraryRail from '../features/setlist/LibraryRail'
import SetHeader from '../features/setlist/SetHeader'
import SetTable from '../features/setlist/SetTable'
import SetActions from '../features/setlist/SetActions'
import AddVerseDialog from '../features/setlist/AddVerseDialog'
import PruneSetlistsModal from '../features/setlist/PruneSetlistsModal'
import ShortcutsDialog from '../features/setlist/ShortcutsDialog'
import { useSetlistKeymap } from '../features/setlist/useSetlistKeymap'
import { usePptxAvailability } from '../features/setlist/usePptxAvailability'
import {
  bundlePptxZip,
  buildShareUrl,
  buildWorshipPath,
  combineSetPptx,
  exportSetPdf,
} from '../features/setlist/setlistExport'

// One page serves four routes:
//   /setlists          the workspace with nothing selected
//   /setlists/:id      a saved setlist (Supabase, autosaved)
//   /setlist           the signed-out draft (localStorage)
//   /setlist/:songIds  and /set/:code — a shared link, hydrated into the draft
//
// The saved and draft builders expose the same controller surface, so
// everything below the hook selection is identical for both.
function useController(setlistId) {
  const saved = useSetlistBuilder(setlistId || '')
  const draft = useDraftSetlist()
  return setlistId ? saved : draft
}

function makeUuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

// "9/14 Worship", localized, de-duplicated against the names already in use —
// the same rule the mobile app uses so a set made on either client reads alike.
function defaultSetName(t, locale, existingNames) {
  const now = new Date()
  let date
  try {
    date = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(now)
  } catch {
    date = `${now.getMonth() + 1}/${now.getDate()}`
  }
  return uniqueName(t('setlist.defaultName', { date }), existingNames)
}

export default function SetlistWorkspacePage() {
  const { t, i18n } = useTranslation('pages')
  const { id: routeId, songIds: routeSongIds, code: routeCode } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { isLoggedIn } = useAuth()
  const chordStyle = useChordStyle()
  const isMobile = useIsMobile()

  const controller = useController(routeId)
  const { items, catalog, songs, songsLoading } = controller
  const lists = usePersonalSetlists()

  const [selectedKey, setSelectedKey] = useState(null)
  const [query, setQuery] = useState('')
  const [communityOnly, setCommunityOnly] = useState(() => {
    try {
      return localStorage.getItem('pref:communityOnly') === '1'
    } catch {
      return false
    }
  })
  const [language, setLanguage] = useState(() =>
    resolveInitialSongLanguage(catalog.translationLanguages || catalog.allLanguages)
  )
  const [railsHidden, setRailsHidden] = useState({ setlists: false, library: false })
  const [mobileTab, setMobileTab] = useState('current')
  const [verseOpen, setVerseOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [pruneOpen, setPruneOpen] = useState(false)
  const [pruneBusy, setPruneBusy] = useState(false)
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const [renameSignal, setRenameSignal] = useState(0)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pptxProgress, setPptxProgress] = useState('')
  const [combineProgress, setCombineProgress] = useState('')

  const verseCache = useRef(new Map())
  const searchRef = useRef(null)
  const hydratedFromRoute = useRef(false)
  const quickApplied = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem('pref:communityOnly', communityOnly ? '1' : '0')
    } catch {
      /* preference is best-effort */
    }
  }, [communityOnly])

  const pptxMap = usePptxAvailability(items, catalog)
  const pptxCount = Object.keys(pptxMap).length

  // --- Hydrating a shared link into the draft -------------------------------
  // /setlist/<slugs>?toKeys= and /set/<code> are the URLs the mobile app's
  // deep-link import emits and parses. They land in the draft builder.
  useEffect(() => {
    if (routeId || hydratedFromRoute.current) return
    if (!songs.length) return

    if (routeCode) {
      const { entries, error } = decodeSet(songs, routeCode)
      if (error) {
        showToast(error)
        navigate('/setlist', { replace: true })
        return
      }
      hydratedFromRoute.current = true
      controller.replaceEntries(entries.map((e) => ({ songId: e.id, toKey: e.toKey || null })))
      navigate('/setlist', { replace: true })
      return
    }

    if (routeSongIds) {
      hydratedFromRoute.current = true
      const ids = routeSongIds.split(',').map((s) => decodeURIComponent(s)).filter(Boolean)
      const keys = (searchParams.get('toKeys') || '')
        .split(',')
        .map((s) => decodeURIComponent(s))
      controller.replaceEntries(
        ids.map((songId, i) => ({ songId, toKey: keys[i] || null }))
      )
    }
  }, [routeId, routeCode, routeSongIds, songs, searchParams, controller, navigate])

  // Home's quick-action cards hand a recipe over in navigation state.
  useEffect(() => {
    const key = location.state?.quickAction
    if (!key || quickApplied.current || !songs.length) return
    quickApplied.current = true
    const entries = buildQuickActionSet(key, songs)
    if (entries.length) {
      controller.replaceEntries(entries.map((s) => ({ songId: s.id, toKey: s.originalKey || null })))
    }
  }, [location.state, songs, controller])

  // --- Derived -------------------------------------------------------------
  const selectedIds = useMemo(() => new Set(items.map((i) => i.songId)), [items])
  const worshipPath = useMemo(() => buildWorshipPath(items, routeId), [items, routeId])
  const telegramItems = useMemo(
    () =>
      items
        .filter((i) => !isVerseId(i.songId))
        .map((i) => {
          const song = catalog.byId.get(i.song.slug)
          const dbId = song?.dbId || (routeId ? i.songId : null)
          return dbId ? { song_id: dbId, key: effectiveEntryKey(i) || '' } : null
        })
        .filter(Boolean),
    [items, catalog, routeId]
  )

  // --- Set mutations -------------------------------------------------------
  const moveBy = useCallback(
    (entryKey, delta) => {
      const index = items.findIndex((i) => i.entryKey === entryKey)
      const target = items[index + delta]
      if (!target) return
      controller.moveEntry(entryKey, target.entryKey)
    },
    [items, controller]
  )

  const transposeEntry = useCallback(
    (entryKey, step) => {
      const item = items.find((i) => i.entryKey === entryKey)
      if (!item || item.song.verse) return
      const from = effectiveEntryKey(item) || 'C'
      const preferFlat = /b/.test(String(item.song.default_key || ''))
      controller.setKeyFor(entryKey, transposeSymPrefer(from, step, preferFlat))
    },
    [items, controller]
  )

  const transposeSet = useCallback(
    (step) => {
      for (const item of items) {
        if (item.song.verse) continue
        const from = effectiveEntryKey(item) || 'C'
        const preferFlat = /b/.test(String(item.song.default_key || ''))
        controller.setKeyFor(item.entryKey, transposeSymPrefer(from, step, preferFlat))
      }
    },
    [items, controller]
  )

  const resetKeys = useCallback(() => {
    for (const item of items) controller.setKeyFor(item.entryKey, null)
  }, [items, controller])

  useSetlistKeymap({
    enabled: !verseOpen && !shortcutsOpen && !pruneOpen,
    items,
    selectedKey,
    onSelect: setSelectedKey,
    onMoveBy: moveBy,
    onRemove: controller.removeEntry,
    onTranspose: transposeEntry,
    onFocusSearch: () => {
      setMobileTab('add')
      searchRef.current?.focus()
      searchRef.current?.select()
    },
    onRename: () => setRenameSignal((n) => n + 1),
    onWorship: () => navigate(worshipPath),
    onShortcuts: () => setShortcutsOpen(true),
  })

  // --- Setlist lifecycle ---------------------------------------------------
  async function onCreate() {
    if (!isLoggedIn) {
      showToast(t('setlist.signInToSaveToast'))
      return
    }
    if (lists.atLimit) {
      setPruneOpen(true)
      return
    }
    // Optimistic: mint the id, show the set immediately, insert in the
    // background. The builder retries its first fetch to cover the in-flight
    // INSERT.
    const id = makeUuid()
    const name = defaultSetName(t, i18n.language, lists.setlists.map((s) => s.name))
    lists.addOptimistic(id, name)
    navigate(`/setlists/${id}`)
    try {
      await lists.create({ id, name })
    } catch (err) {
      lists.dropOptimistic(id)
      if (String(err?.message || '').includes('PERSONAL_SETLIST_LIMIT_REACHED')) {
        navigate('/setlists')
        setPruneOpen(true)
      } else {
        console.error('[SetlistWorkspace] create:', err)
        showToast(t('setlist.failedSave'))
      }
    }
  }

  async function onDeleteCurrent() {
    if (!routeId) return
    if (!window.confirm(t('setlist.deleteConfirm', { name: controller.name }))) return
    try {
      await controller.deleteSet()
      lists.dropOptimistic(routeId)
      showToast(t('setlist.setlistDeleted'))
      navigate('/setlists')
    } catch (err) {
      console.error('[SetlistWorkspace] delete:', err)
      showToast(t('setlist.failedDelete'))
    }
  }

  async function onDuplicateCurrent(id) {
    try {
      const copy = await lists.duplicate(id || routeId)
      if (copy?.id) navigate(`/setlists/${copy.id}`)
    } catch (err) {
      if (String(err?.message || '').includes('PERSONAL_SETLIST_LIMIT_REACHED')) {
        setPruneOpen(true)
        return
      }
      console.error('[SetlistWorkspace] duplicate:', err)
      showToast(t('setlist.failedSave'))
    }
  }

  // Promote the signed-out draft into a real setlist.
  async function onSaveDraft() {
    if (!isLoggedIn) {
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    if (lists.atLimit) {
      setPruneOpen(true)
      return
    }
    try {
      const name =
        controller.name.trim() ||
        defaultSetName(t, i18n.language, lists.setlists.map((s) => s.name))
      const created = await createSetlist(supabase, { name })
      await updateSetlist(supabase, created.id, {
        name,
        serviceDate: null,
        songs: items.map((item) => ({
          id: isVerseId(item.songId)
            ? item.songId
            : catalog.byId.get(item.song.slug)?.dbId || item.songId,
          toKey: item.toKey,
        })),
      })
      clearDraft()
      controller.reset?.()
      await lists.refresh()
      showToast(t('setlist.setlistSaved'))
      navigate(`/setlists/${created.id}`)
    } catch (err) {
      if (String(err?.message || '').includes('PERSONAL_SETLIST_LIMIT_REACHED')) {
        setPruneOpen(true)
        return
      }
      console.error('[SetlistWorkspace] promote draft:', err)
      showToast(t('setlist.failedSave'))
    }
  }

  // --- Exports -------------------------------------------------------------
  async function onPdf() {
    setPdfBusy(true)
    try {
      await exportSetPdf(items, catalog, {
        chordStyle,
        t,
        onMessage: showToast,
        verseCache: verseCache.current,
      })
    } finally {
      setPdfBusy(false)
    }
  }

  async function onShare() {
    try {
      await navigator.clipboard.writeText(buildShareUrl(items))
      showToast(t('setlist.linkCopied'))
    } catch {
      showToast(t('setlist.failedCopy'))
    }
  }

  async function onBundlePptx() {
    if (combineProgress || pptxProgress) return
    await bundlePptxZip(items, catalog, pptxMap, {
      t,
      onProgress: setPptxProgress,
      onMessage: showToast,
    })
  }

  async function onCombinePptx() {
    if (combineProgress || pptxProgress) return
    setCombineProgress(t('setlist.combining'))
    try {
      await combineSetPptx(items, catalog, pptxMap, controller.name, { t, onMessage: showToast })
    } catch (err) {
      console.error('[SetlistWorkspace] combine pptx:', err)
      showToast(t('setlist.failedCombine'))
    } finally {
      setCombineProgress('')
    }
  }

  function onServiceDate() {
    const next = window.prompt(t('setlist.fieldServiceDate'), controller.serviceDate || '')
    if (next === null) return
    controller.setDate(next.trim() || null)
  }

  // --- Render --------------------------------------------------------------
  const actions = (
    <SetActions
      items={items}
      worshipPath={worshipPath}
      pptxCount={pptxCount}
      busy={pdfBusy}
      pptxProgress={pptxProgress}
      combineProgress={combineProgress}
      persisted={!!routeId}
      telegramItems={telegramItems}
      onShare={onShare}
      onPdf={onPdf}
      onCombinePptx={onCombinePptx}
      onBundlePptx={onBundlePptx}
      onRename={() => setRenameSignal((n) => n + 1)}
      onDuplicate={() => onDuplicateCurrent()}
      onDelete={onDeleteCurrent}
      onTransposeSet={transposeSet}
      onResetKeys={resetKeys}
      onServiceDate={onServiceDate}
    />
  )

  const noSelection = !routeId && location.pathname === '/setlists'

  const centre = (
    <div className="gc-set-main">
      {controller.loadFailed ? (
        <div className="gc-set-notice">
          <h1 className="gc-set-heading">{t('setlist.title')}</h1>
          <p>{t('setlist.failedLoad')}</p>
          <Button variant="primary" onClick={controller.retryLoad}>
            {t('setlist.retry')}
          </Button>
        </div>
      ) : controller.notFound ? (
        <div className="gc-set-notice">
          <h1 className="gc-set-heading">{t('setlist.title')}</h1>
          <p>{t('setlist.setNotFound')}</p>
          <Button as={Link} to="/setlists" variant="secondary">
            {t('setlist.backToSets')}
          </Button>
        </div>
      ) : noSelection ? (
        <div className="gc-set-notice">
          <h1 className="gc-set-heading">{t('setlist.title')}</h1>
          <p>{t('setlist.pickASet')}</p>
          <Button variant="primary" iconLeft={<PlusIcon />} onClick={onCreate}>
            {t('setlist.newSet')}
          </Button>
        </div>
      ) : (
        <>
          <SetHeader
            name={controller.name}
            items={items}
            updatedAt={controller.updatedAt}
            saving={controller.saving}
            saveFailed={controller.saveFailed}
            persisted={!!routeId}
            renameSignal={renameSignal}
            onRename={(next) => {
              controller.setName(next)
              if (routeId) lists.rename(routeId, next)
            }}
          />
          <div className="gc-set-scroll">
            <SetTable
              items={items}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onMove={controller.moveEntry}
              onMoveBy={moveBy}
              onRemove={controller.removeEntry}
              onDuplicate={controller.duplicateEntry}
              onKeyChange={controller.setKeyFor}
            />
            <div className="gc-set-footer-actions">
              <Button size="sm" variant="secondary" onClick={() => setVerseOpen(true)}>
                {t('setlist.addVerse')}
              </Button>
              <button
                type="button"
                className="gc-linkbtn"
                onClick={() => setShortcutsOpen(true)}
              >
                {t('setlist.shortcutsHint')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )

  const setlistsRail = (
    <SetlistsRail
      setlists={lists.setlists}
      loading={lists.loading}
      error={lists.error}
      currentId={routeId}
      limit={lists.limit}
      atLimit={lists.atLimit}
      isLoggedIn={isLoggedIn}
      onOpen={(id) => navigate(`/setlists/${id}`)}
      onCreate={onCreate}
      onRename={async (id, name) => {
        lists.rename(id, name)
        if (id === routeId) controller.setName(name)
        else {
          try {
            const target = lists.setlists.find((s) => s.id === id)
            await updateSetlist(supabase, id, {
              name,
              serviceDate: target?.service_date || null,
              // Renaming from the rail must not touch the set's songs, and
              // updateSetlist wipes and re-inserts them — so re-send what is
              // stored rather than an empty list.
              songs: await fetchEntriesForRename(id),
            })
          } catch (err) {
            console.error('[SetlistWorkspace] rename:', err)
            showToast(t('setlist.failedSave'))
            await lists.refresh()
          }
        }
      }}
      onDuplicate={onDuplicateCurrent}
      onDelete={async (id) => {
        try {
          await lists.remove(id)
          showToast(t('setlist.setlistDeleted'))
          if (id === routeId) navigate('/setlists')
        } catch (err) {
          console.error('[SetlistWorkspace] delete:', err)
          showToast(t('setlist.failedDelete'))
        }
      }}
      onRetry={lists.refresh}
    />
  )

  const libraryRail = (
    <LibraryRail
      catalog={catalog}
      songsLoading={songsLoading}
      query={query}
      onQuery={setQuery}
      communityOnly={communityOnly}
      onCommunityOnly={setCommunityOnly}
      language={language}
      onLanguage={(code) => {
        setLanguage(code)
        writeSongLanguagePreference(code)
      }}
      selectedIds={selectedIds}
      onToggle={controller.toggleSong}
      searchRef={searchRef}
    />
  )

  return (
    <PageContainer className="is-setlist-workspace">
      <Toolbar className="gc-set-bar">
        {!isMobile ? (
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={t('setlist.toggleSetlists')}
            aria-pressed={!railsHidden.setlists}
            iconLeft={<ListIcon />}
            onClick={() => setRailsHidden((r) => ({ ...r, setlists: !r.setlists }))}
          />
        ) : null}
        {/* apps/web/AGENTS.md: on mobile the export actions belong in the sheet,
            not as individual buttons in the bar. */}
        {!isMobile ? <div className="gc-set-bar-actions">{actions}</div> : null}
        {!isMobile ? (
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={t('setlist.toggleLibrary')}
            aria-pressed={!railsHidden.library}
            iconLeft={<SearchIcon />}
            onClick={() => setRailsHidden((r) => ({ ...r, library: !r.library }))}
          />
        ) : null}
        {isMobile ? (
          <div className="gc-set-bar-actions">
            <Button
              variant="primary"
              size="sm"
              as={Link}
              to={worshipPath}
              iconLeft={<MediaIcon />}
              title={t('setlist.worshipModeTooltip')}
            >
              {t('setlist.worshipMode')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMobileActionsOpen(true)}>
              {t('setlist.moreActions')}
            </Button>
          </div>
        ) : null}
      </Toolbar>

      {!routeId && !isLoggedIn ? (
        <div className="gc-draft-banner">
          <strong>{t('setlist.draftTitle')}</strong>
          <span>{t('setlist.draftBody')}</span>
          <Button size="sm" variant="primary" onClick={onSaveDraft}>
            {t('setlist.saveToMySetlists')}
          </Button>
        </div>
      ) : null}
      {!routeId && isLoggedIn && items.length > 0 ? (
        <div className="gc-draft-banner">
          <strong>{t('setlist.draftTitle')}</strong>
          <Button size="sm" variant="primary" onClick={onSaveDraft}>
            {t('setlist.saveToMySetlists')}
          </Button>
        </div>
      ) : null}

      {isMobile ? (
        <MobilePaneTabs
          value={mobileTab === 'add' ? 'add' : 'current'}
          onChange={setMobileTab}
          addLabel={t('setlist.addSongsTab')}
          currentLabel={t('setlist.currentTab', { count: items.length })}
          savedLabel={isLoggedIn ? t('setlist.savedTab') : undefined}
        />
      ) : null}

      <div
        className={[
          'gc-set-workspace',
          railsHidden.setlists ? 'is-setlists-hidden' : '',
          railsHidden.library ? 'is-library-hidden' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="gc-set-col gc-set-col--left" hidden={isMobile && mobileTab !== 'saved'}>
          {setlistsRail}
        </div>
        <div className="gc-set-col gc-set-col--mid" hidden={isMobile && mobileTab !== 'current'}>
          {centre}
        </div>
        <div className="gc-set-col gc-set-col--right" hidden={isMobile && mobileTab !== 'add'}>
          {libraryRail}
        </div>
      </div>

      <AddVerseDialog
        open={verseOpen}
        onClose={() => setVerseOpen(false)}
        onAdd={controller.addVerse}
        verseCache={verseCache.current}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PruneSetlistsModal
        open={pruneOpen}
        setlists={lists.setlists}
        limit={lists.limit}
        busy={pruneBusy}
        onClose={() => setPruneOpen(false)}
        onDelete={async (ids) => {
          setPruneBusy(true)
          try {
            await lists.removeMany(ids)
            showToast(t('setlist.manageDeleted', { count: ids.length }))
            setPruneOpen(false)
          } catch (err) {
            console.error('[SetlistWorkspace] prune:', err)
            showToast(t('setlist.failedDelete'))
          } finally {
            setPruneBusy(false)
          }
        }}
      />
      <MobileActionSheet
        open={mobileActionsOpen}
        onClose={() => setMobileActionsOpen(false)}
        title={t('setlist.actionsTitle')}
      >
        <div className="gc-mobile-actions">{actions}</div>
      </MobileActionSheet>
    </PageContainer>
  )
}

// Re-read a setlist's entries so a rail rename can round-trip them through
// updateSetlist's wipe-and-replace without dropping the songs.
async function fetchEntriesForRename(setlistId) {
  const { fetchSetlist } = await import('@gracechords/core')
  const data = await fetchSetlist(supabase, setlistId)
  return (data?.entries || []).map((e) => ({ id: e.song_id, toKey: e.toKey }))
}

// The three recipes Home's quick-action cards can hand over.
function buildQuickActionSet(key, songs) {
  const used = new Set()
  const unique = (pool) => pool.filter((s) => s && !used.has(s.id))
  const take = (pool) => {
    const pick = unique(pool).length ? pickRandom(unique(pool)) : null
    if (pick) used.add(pick.id)
    return pick
  }

  if (key === 'threeSongFlow') {
    const slow = filterByTag(songs, 'SLOW')
    const fast = filterByTag(songs, 'FAST')
    const inKey = (k) => slow.filter((s) => (s?.originalKey || '').toUpperCase() === k)
    return [
      take(inKey('G')) || take(slow) || take(songs),
      take(fast) || take(songs),
      take(inKey('A')) || take(slow) || take(songs),
    ].filter(Boolean)
  }

  const pool =
    key === 'celebrationSet'
      ? filterByTag(songs, 'FAST')
      : filterByTag(songs, pickRandom(['CROSS', 'COMMITMENT', 'MISSION', 'MISSIONS', 'PRAISE', 'HYMN']))

  const out = pickManyRandom(pool, Math.min(4, pool.length)).filter(Boolean)
  out.forEach((s) => used.add(s.id))
  if (out.length < 4) {
    out.push(...pickManyRandom(unique(songs), Math.min(4 - out.length, Math.max(0, songs.length - out.length))))
  }
  return out.filter(Boolean).slice(0, 4)
}
