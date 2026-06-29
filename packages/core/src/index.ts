// @gracechords/core — barrel for new code (web + mobile).
// Existing web imports continue to resolve through the thin shims left at the
// original src/utils/... paths, so this barrel is purely additive.

// ChordPro parser + types (shareable; the renderer stays web-side)
export * from './chordpro/types'
export * from './chordpro/parser'
export * from './chordpro/serialize'
export * from './chordpro/lint'
export * from './chordpro/convert'
export * from './chordpro/lexer'
export * from './chordpro/solfege'
export * from './chordpro/diatonicChords'
// Transposition + KEYS (chordpro/index.js)
export * from './chordpro/index.js'

// Song-domain pure helpers
export * from './songs/chords'
export * from './songs/instrumental'
export * from './songs/verseRef'
export * from './songs/songMetadata'
export * from './songs/sort'
export * from './songs/songsRepo'

// Setlist codec
export * from './setlists/setcode'

// Role hierarchy
export * from './rbac/roles'

// Supabase factory (createGcSupabase). Web imports it via the
// '@gracechords/core/supabase/client' subpath, which works under Vite; exposing
// it on the barrel too lets Metro (React Native) consume the same factory
// without the extensionless subpath its package-exports resolver rejects.
export * from './supabase/client'
