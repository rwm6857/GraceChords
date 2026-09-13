import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Chip, Input } from '../../components/ui/layout-kit'
import { CheckIcon, PlusIcon } from '../../components/Icons'
import { searchSongs } from '../../utils/songs/search'
import { isIncompleteSong } from '../../utils/songs/songStatus'
import {
  getLanguageChipLabel,
  hasGroupLanguage,
  resolveGroupEntry,
} from '../../utils/songs/songCatalog'

const MAX_RESULTS = 80

// The song library as a rail of single-line rows rather than the old
// `minmax(260px, 1fr)` card grid — the grid is what left the page full of gaps
// when a search returned a handful of songs.
export default function LibraryRail({
  catalog,
  songsLoading,
  query,
  onQuery,
  communityOnly,
  onCommunityOnly,
  language,
  onLanguage,
  selectedIds,
  onToggle,
  searchRef,
}) {
  const { t } = useTranslation('pages')
  const languageChips = catalog.translationLanguages || []

  const results = useMemo(() => {
    const pool = []
    for (const group of catalog.groups || []) {
      const entry = resolveGroupEntry(group, language)
      if (!entry) continue
      if (communityOnly && !(entry.tags || []).some((tag) => /community/i.test(tag))) continue
      pool.push(entry)
    }
    const matched = query.trim() ? searchSongs(pool, query).map((r) => r.item) : pool
    return matched.slice(0, MAX_RESULTS)
  }, [catalog, language, communityOnly, query])

  return (
    <div className="gc-rail gc-rail--library">
      <div className="gc-rail-head">{t('setlist.addSongs')}</div>
      <div className="gc-rail-controls">
        <Input
          ref={searchRef}
          id="gc-library-search"
          type="search"
          value={query}
          placeholder={t('setlist.search')}
          aria-label={t('setlist.search')}
          onChange={(e) => onQuery(e.target.value)}
        />
        <label className="gc-rail-toggle">
          <input
            type="checkbox"
            checked={communityOnly}
            onChange={(e) => onCommunityOnly(e.target.checked)}
          />
          <span title={t('setlist.communitySetlistTooltip')}>{t('setlist.communitySetlist')}</span>
        </label>
        {languageChips.length > 1 ? (
          <div className="gc-rail-langs">
            {languageChips.map((code) => (
              <Chip
                key={code}
                variant="filter"
                selected={language === code}
                onClick={() => onLanguage(code)}
                title={t('setlist.languageTooltip', { language: getLanguageChipLabel(code) })}
              >
                {getLanguageChipLabel(code)}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="gc-rail-body">
        {songsLoading ? (
          <p className="gc-rail-note">{t('setlist.loadingSearch')}</p>
        ) : results.length === 0 ? (
          <p className="gc-rail-note">{t('setlist.noSongsMatch', { query: query.trim() })}</p>
        ) : (
          results.map((song) => {
            const inSet = selectedIds.has(song.dbId) || selectedIds.has(song.id)
            const group = catalog.groupByEntryId?.get(song.id)
            const translated = group && hasGroupLanguage(group, language)
            return (
              <button
                key={song.id}
                type="button"
                className={`gc-lib-row${inSet ? ' is-in-set' : ''}`}
                aria-pressed={inSet}
                onClick={() => onToggle(song)}
              >
                <span className="gc-lib-info">
                  <span className="gc-lib-title">
                    {song.title}
                    {isIncompleteSong(song) ? (
                      <span className="gc-lib-flag">{t('setlist.incomplete')}</span>
                    ) : null}
                  </span>
                  <span className="gc-lib-sub">
                    {[
                      (song.authors || []).join(', '),
                      song.originalKey,
                      song.tempo ? t('setlist.bpmValue', { bpm: song.tempo }) : '',
                      translated && song.language !== 'en' ? getLanguageChipLabel(song.language) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="gc-lib-pill" aria-hidden="true">
                  {inSet ? <CheckIcon /> : <PlusIcon />}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
