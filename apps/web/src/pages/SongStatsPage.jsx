import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  SONG_STATS_DEFAULT_WINDOW,
  SONG_STATS_INSIGHT_RULES as R,
  SONG_STATS_RULES,
  SONG_STATS_WINDOWS,
  formatSongStatsDate,
} from '@gracechords/core'
import { useAuth } from '../hooks/useAuth'
import { Button, SegmentedControl } from '../components/ui/layout-kit'
import SongStatsSummary from '../features/songStats/SongStatsSummary'
import SongStatsAboutDialog from '../features/songStats/SongStatsAboutDialog'
import { useSongStatsInsights } from '../features/songStats/useSongStatsInsights'
import { isSongStatsEnabled } from '../lib/songStats'
import '../styles/song-stats.css'

// Song Stats detail (web). Same sections and copy as the mobile screen, from
// the same core computation. Worship-planning prompts, not a scoreboard.
export default function SongStatsPage() {
  const { t, i18n } = useTranslation(['stats', 'common'])
  const { isLoggedIn, loading } = useAuth()
  const navigate = useNavigate()
  const [range, setRange] = useState(SONG_STATS_DEFAULT_WINDOW)
  const [aboutOpen, setAboutOpen] = useState(false)
  const { status, insights, visible, preview, reload } = useSongStatsInsights(range)

  useEffect(() => {
    if (!loading && !isLoggedIn) navigate('/login')
  }, [isLoggedIn, loading, navigate])

  const date = (d) => formatSongStatsDate(d, i18n.language)
  const name = (s) => s.title ?? t('removedSong')

  function songList(items, value) {
    return (
      <ol className="gc-stats-list">
        {items.map((item) => (
          <li key={item.key}>
            <span className="gc-stats-list__title">
              {name(item)}
              {item.source === 'personal' ? <span className="gc-stats-chip">{t('personal')}</span> : null}
            </span>
            <span className="gc-stats-list__value">{value(item)}</span>
          </li>
        ))}
      </ol>
    )
  }

  function section(title, body, note) {
    return (
      <section className="gc-stats-section" key={title}>
        <h2>{title}</h2>
        {body}
        {note ? <p className="gc-stats-note">{note}</p> : null}
      </section>
    )
  }

  function renderStats() {
    const s = insights
    return (
      <>
        {section(t('overview'), <SongStatsSummary summary={s.summary} />)}
        {section(
          t('mostSung.title'),
          s.mostSung.length
            ? songList(s.mostSung, (x) => t('mostSung.count', { count: x.count }))
            : <p className="gc-stats-empty">{t('mostSung.empty')}</p>,
        )}
        {s.newThisPeriod.length
          ? section(t('newSongs.title'), songList(s.newThisPeriod, (x) => date(x.firstSung)))
          : null}
        {s.heavyRotation.length
          ? section(
              t('rotation.title'),
              songList(s.heavyRotation, (x) => t('rotation.value', { sets: x.sets, of: x.of })),
              t('rotation.hint', { min: R.heavyRotationMin, of: R.recentSessions }),
            )
          : null}
        {s.resting.length
          ? section(
              t('resting.title'),
              songList(s.resting, (x) => date(x.lastSung)),
              t('resting.hint', { months: Math.round(R.dormantDays / 30) }),
            )
          : null}
      </>
    )
  }

  function renderBody() {
    if (status === 'loading') return <p className="gc-stats-empty">{t('common:loading')}</p>
    if (status === 'error') {
      return (
        <div className="gc-stats-gate">
          <p>{t('loadError')}</p>
          <Button size="sm" variant="secondary" onClick={() => void reload()}>
            {t('retry')}
          </Button>
        </div>
      )
    }
    if (!visible) {
      return (
        <div className="gc-stats-gate">
          <h2>{t('gate.title', { count: R.gateSessions })}</h2>
          <p>{t('gate.body', { done: insights?.totalSessions ?? 0, perSong: SONG_STATS_RULES.perSongSessionMs / 1000 })}</p>
        </div>
      )
    }
    return renderStats()
  }

  const previewNote = preview.sample
    ? t('preview.sampleBadge')
    : insights && visible && !insights.gateMet
      ? t('preview.belowGate', { done: insights.totalSessions, count: R.gateSessions })
      : null

  return (
    <div className="container gc-stats-page">
      <Helmet><title>{`${t('title')} · GraceChords`}</title></Helmet>
      <h1>{t('title')}</h1>
      {previewNote ? <p className="gc-stats-note">{previewNote}</p> : null}
      {!isSongStatsEnabled() ? <p className="gc-stats-note">{t('off')}</p> : null}

      {visible ? (
        <SegmentedControl
          options={SONG_STATS_WINDOWS.map((w) => ({ value: w, label: t(`window.${w}`) }))}
          value={range}
          onChange={setRange}
          ariaLabel={t('title')}
        />
      ) : null}

      {renderBody()}

      {preview.canPreview ? (
        <section className="gc-stats-section gc-stats-preview">
          <h2>{t('preview.title')}</h2>
          <label>
            <input
              type="checkbox"
              checked={preview.bypassGate}
              onChange={(e) => preview.set({ bypassGate: e.target.checked })}
            />
            {t('preview.bypassGate', { count: R.gateSessions })}
          </label>
          <label>
            <input
              type="checkbox"
              checked={preview.sample}
              onChange={(e) => preview.set({ sample: e.target.checked })}
            />
            {t('preview.sample')}
          </label>
          <p className="gc-stats-note">{t('preview.hint')}</p>
        </section>
      ) : null}

      <p className="gc-stats-footer">
        <button type="button" className="gc-linkbtn" onClick={() => setAboutOpen(true)}>
          {t('about.link')}
        </button>
      </p>

      <SongStatsAboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}
