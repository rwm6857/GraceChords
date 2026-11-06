// Song Stats capture thresholds — the ONE place they live.
//
// The capture rule, the song-open rule and the in-app "About Song Stats" copy
// (Phase 2) all read these, so a threshold change can never leave the
// explainer saying something the code no longer does. Starting values; tune
// once real data accrues.

export const SONG_STATS_RULES = {
  /** A song counts toward a set once it has been on screen this long in total. */
  minSongDisplayMs: 30_000,
  /** A set qualifies when its on-screen time is at least this × counted songs… */
  perSongSessionMs: 150_000,
  /** …and never less than this, whatever the song count. */
  minSessionMs: 120_000,
  /** A song-viewer open counts once the song has been on screen this long. */
  minOpenDisplayMs: 15_000,
  /** At most one recorded open per user and song in this window. */
  openDebounceMs: 3_600_000,
  /** How often a running performer session re-saves itself to device storage. */
  checkpointMs: 15_000,
} as const

/** What the Song Stats screens show, and when. Read by the copy as well as the math. */
export const SONG_STATS_INSIGHT_RULES = {
  /** Nothing is shown until the user has logged this many sets. */
  gateSessions: 10,
  /** Length of the Most sung / Most opened lists. */
  topSongs: 10,
  /** Heavy rotation and repeat rate look at this many most recent sets. */
  recentSessions: 8,
  /** Heavy rotation: in at least this many of the recent sets. */
  heavyRotationMin: 5,
  /** A song is resting once it hasn't been sung for this many days. */
  dormantDays: 180,
  dormantMax: 15,
  /** Long-time songs must still have been sung within this many days. */
  activeDays: 90,
  longTimeMax: 5,
} as const

export type SongStatsWindow = '3m' | '12m' | 'all'
export const SONG_STATS_WINDOWS: readonly SongStatsWindow[] = ['3m', '12m', 'all']
export const SONG_STATS_DEFAULT_WINDOW: SongStatsWindow = '12m'

/** Minimum on-screen time for a set that showed `songCount` qualifying songs. */
export function requiredSessionMs(songCount: number): number {
  return Math.max(SONG_STATS_RULES.minSessionMs, songCount * SONG_STATS_RULES.perSongSessionMs)
}

/** True when a set of `songCount` counted songs and `activeMs` on screen is a real set. */
export function sessionQualifies(songCount: number, activeMs: number): boolean {
  return songCount > 0 && activeMs >= requiredSessionMs(songCount)
}

/**
 * Anonymous feature counters. Must match the CHECK constraint on
 * public.feature_counters (supabase/migrations/20261105140000_song_stats_collection.sql).
 */
export const SONG_STATS_FEATURES = [
  'tuner',
  'metronome',
  'pitch_pipe',
  'key_reference',
  'capo',
  'performer_mode',
  'pdf_export',
  'image_export',
  'daily_word',
  'telegram_link',
] as const

export type SongStatsFeature = (typeof SONG_STATS_FEATURES)[number]

/** users.preferences key. Absent or true = collecting; false = turned off. */
export const SONG_STATS_PREF_KEY = 'song_stats_enabled'

/** Read the opt-out from a users.preferences object. Defaults to on. */
export function songStatsEnabledFromPreferences(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== 'object') return true
  return (preferences as Record<string, unknown>)[SONG_STATS_PREF_KEY] !== false
}
