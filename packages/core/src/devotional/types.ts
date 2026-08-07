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

/** One line of a verse stanza. `indent` is the source's relative indentation. */
export type VerseLine = {
  /**
   * Leading spaces in the source, relative to the stanza. Non-zero on hanging
   * continuation lines and centered inscriptions. A renderer that centres the
   * stanza may ignore this; it exists so the artifact stays lossless.
   */
  indent: number
  spans: Span[]
}

/**
 * A hymn or verse stanza. Lines are kept discrete because they are set as
 * distinct centered lines, not reflowed as prose.
 */
export type VerseBlock = {
  type: 'verse'
  lines: VerseLine[]
}

/**
 * A body block. The union is open on purpose: authored content added later may
 * introduce types this build does not know, and a renderer must skip an
 * unknown block rather than crash.
 */
export type DevotionalBlock = ParagraphBlock | VerseBlock | { type: string }

export type Devotional = {
  /** Source identifier. For the CCEL corpus, its original M&E key. */
  id: string
  /**
   * URL-safe slug from the MATCHED reference. Unique within its day, but NOT
   * globally: 13 slugs recur across different days, so a deep link needs the
   * day key as well as the slug.
   */
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
  /**
   * Vestige of the abandoned morning/evening structure. Null for the large
   * majority. Carried for provenance only — never used for ordering or display.
   */
  timeHint: 'morning' | 'evening' | null
  bodyBlocks: DevotionalBlock[]
}

/** Whether a day carries two devotionals, one, or none. */
export type DayState = 'two' | 'one' | 'open'

export type DayEntry = {
  state: DayState
  /** The day's M'Cheyne reading slots, as displayed, e.g. `Psalms 119:145-176`. */
  readings: string[]
  /** In display order: the day's reading order. Empty when `state` is `open`. */
  devotionals: Devotional[]
}

/**
 * One month, keyed by `MM-DD`. EVERY day of the month is present, including
 * open ones, so a client lookup never misses. There is no `02-29` key — the
 * leap day clamps to `02-28` (see dayKey.ts).
 */
export type MonthFile = {
  month: number
  schemaVersion: number
  days: Record<string, DayEntry>
}

export type ManifestMonth = {
  /** Path relative to the devotionals root, including the content version. */
  file: string
  /** sha256 of the month file's bytes, hex. */
  hash: string
  bytes: number
}

export type Manifest = {
  /** Artifact schema version. Bumped only on a breaking shape change. */
  schemaVersion: number
  /**
   * Content fingerprint. Appears in every month path, so month objects are
   * immutable and never need cache invalidation.
   */
  contentVersion: string
  /** Build timestamp when one was injected, else null. Never used for sync. */
  generatedAt: string | null
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
