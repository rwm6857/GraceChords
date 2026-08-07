// Devotional domain types. DOM-free, dependency-free, no Supabase — safe to
// import from the mobile app by subpath (`@gracechords/core/devotional/types`)
// without dragging the core barrel's Supabase client into the bundle.
//
// Devotional content is matched to each day's M'Cheyne readings BY SCRIPTURE.
// An entry appears on a day only because its own verse falls inside what the
// plan reads that day. Nothing is derived on the client: `slug`, `excerpt`,
// display order and the parsed `bodyBlocks` are all precomputed in the artifact.

/** A run of body text. `i` marks italic; absent means regular. */
export type Span = {
  t: string
  i?: boolean
}

/** A prose paragraph. */
export type ParagraphBlock = {
  type: 'p'
  spans: Span[]
}

/**
 * A hymn or verse stanza. Lines are kept discrete because they are set as
 * distinct centered lines, not reflowed as prose.
 */
export type VerseBlock = {
  type: 'verse'
  lines: Span[][]
}

/**
 * A body block. The union is open on purpose: authored content added later may
 * introduce types this build does not know, and a renderer must skip an
 * unknown block rather than crash.
 */
export type DevotionalBlock = ParagraphBlock | VerseBlock | { type: string }

export type Devotional = {
  /** Stable, globally unique, URL-safe. The deep-link identifier. */
  slug: string
  /** Scripture the entry is built on, e.g. `Genesis 1:5`. Card eyebrow. */
  reference: string
  /** The entry's opening scripture quotation. This IS the title — none exists. */
  coreText: string
  /** Precomputed card summary. Plain text, no markup. */
  excerpt: string
  author: string
  sourceWork: string
  /** The chapter of the day's reading this entry matched, e.g. `Genesis 1`. */
  matchedChapter: string | null
  bodyBlocks: DevotionalBlock[]
}

/**
 * One month of devotionals, keyed by `MM-DD`. Every day of the month is
 * present; a day with no scripture match maps to an empty array.
 */
export type MonthFile = {
  month: number
  /** Content hash of this file, matching its manifest entry. */
  version: string
  days: Record<string, Devotional[]>
}

export type ManifestMonth = {
  /** Path relative to the manifest, e.g. `month/01.json`. */
  file: string
  /** sha256 of the month file's bytes, hex. */
  hash: string
  bytes: number
}

export type Manifest = {
  /** Artifact schema version. Bumped only on a breaking shape change. */
  schema: number
  /** Keyed by zero-padded month, `"01"`–`"12"`. */
  months: Record<string, ManifestMonth>
}

/** Persisted record of what the device has already cached. */
export type SyncState = {
  /** Last successful manifest check, epoch ms. */
  lastCheckedAt: number
  /** Cached month hash by zero-padded month. */
  hashes: Record<string, string>
}
