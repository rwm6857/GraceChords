/**
 * seed-songs.js
 * Reads all .chordpro files from public/songs/ and upserts them into the
 * Supabase songs table using the service role key.
 *
 * Usage:
 *   node scripts/seed-songs.js
 *
 * Required env vars (in .env or .env.local):
 *   VITE_SUPABASE_URL         — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role secret (NEVER expose in the browser)
 *
 * Note: static files in public/songs/ are left in place as a backup.
 * They can be removed after you have verified all songs in the database.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Env loader (no dotenv dependency needed)
// ---------------------------------------------------------------------------
function loadEnvFile(filepath) {
  try {
    const text = readFileSync(filepath, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (key && !(key in process.env)) {
        process.env[key] = val
      }
    }
  } catch {
    // file doesn't exist — ignore
  }
}

loadEnvFile(join(ROOT, '.env'))
loadEnvFile(join(ROOT, '.env.local'))

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Missing required env vars.')
  console.error('  VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗ NOT SET')
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✓' : '✗ NOT SET')
  console.error('')
  console.error('Add SUPABASE_SERVICE_ROLE_KEY to your .env file and retry.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// ChordPro helpers
// ---------------------------------------------------------------------------

/** Parse all {key: value} directives from a chordpro file into a plain object. */
function parseMeta(text) {
  const meta = {}
  const pattern = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/gm
  for (const match of text.matchAll(pattern)) {
    meta[match[1].trim().toLowerCase()] = match[2].trim()
  }
  return meta
}

/**
 * Keys that are pure song metadata — they will be stripped from
 * chordpro_content so the renderer doesn't see duplicate info.
 * Structural directives (start_of_verse, end_of_chorus, capo, comment …)
 * are NOT in this set and will be kept.
 */
const METADATA_KEYS = new Set([
  'title', 'key', 'authors', 'author', 'artist', 'tags', 'tag',
  'youtube', 'country', 'lang', 'language', 'locale',
  'id', 'song_id', 'songid',
  'translation_group', 'translationgroup', 'translation_of', 'translationof',
  'group', 'added', 'addedat', 'bpm', 'source', 'incomplete',
])

/**
 * Extract the renderable chordpro body:
 *   - strip known metadata directive lines
 *   - strip the disclaimer comment block (# --- … to end of file)
 *   - preserve all remaining lines including blank lines exactly as-is
 */
function extractContent(text) {
  const lines = text.split('\n')
  const out = []
  let inDisclaimer = false

  for (const line of lines) {
    // Detect disclaimer block start
    if (line.trimStart().startsWith('# ---')) {
      inDisclaimer = true
    }
    if (inDisclaimer) continue

    // Strip metadata-only directives
    const directiveMatch = line.match(/^\{\s*([^:}]+)\s*:/)
    if (directiveMatch) {
      const key = directiveMatch[1].trim().toLowerCase()
      if (METADATA_KEYS.has(key)) continue
    }

    out.push(line)
  }

  // Trim trailing blank lines only (preserve internal blank lines)
  while (out.length > 0 && out[out.length - 1].trim() === '') {
    out.pop()
  }

  return out.join('\n')
}

/** Slugify a string the same way buildIndex.mjs does. */
function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Parse comma/semicolon-separated tags into a normalized array. */
function parseTags(val) {
  const raw = String(val || '')
  if (!raw.trim()) return []
  const seen = new Set()
  const out = []
  const ACRONYMS = new Set(['icp'])
  for (const part of raw.split(/[,;]/)) {
    const key = part.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(ACRONYMS.has(key) ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))
  }
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const songsDir = join(ROOT, 'public', 'songs')
const files = readdirSync(songsDir)
  .filter(f => f.endsWith('.chordpro'))
  .filter(f => !/^test_/i.test(f))  // skip test files
  .sort()

console.log(`Found ${files.length} .chordpro files. Seeding…\n`)

let successCount = 0
let errorCount = 0

for (const filename of files) {
  const text = readFileSync(join(songsDir, filename), 'utf8')
  const meta = parseMeta(text)

  // Derive the slug using the same logic as buildIndex.mjs
  const fallbackId = slugify(meta.title || filename.replace(/\.chordpro$/i, ''))
  const slug = slugify(meta.id || fallbackId) || fallbackId

  const title = meta.title || slug
  const artist = (meta.authors || meta.author || meta.artist || '').trim() || null
  const defaultKey = meta.key || null
  const tags = parseTags(meta.tags || meta.tag)
  const country = meta.country || null
  const youtubeId = meta.youtube || null
  const chordproContent = extractContent(text)

  // source_filename = stem of the .chordpro file (without extension).
  // Stored so the frontend can build correct pptx/JPG URLs even when the
  // file stem doesn't match the slug (18 songs have this mismatch).
  const sourceFilename = filename.replace(/\.chordpro$/i, '')

  const row = {
    slug,
    title,
    artist,
    default_key: defaultKey,
    tags,
    country,
    youtube_id: youtubeId,
    source_filename: sourceFilename,
    chordpro_content: chordproContent,
    // song_group_id, pptx_url, mp3_url, tempo, time_signature — left as DB default/null
  }

  const { error } = await supabase
    .from('songs')
    .upsert(row, { onConflict: 'slug' })

  if (error) {
    console.error(`  ✗ ${title} (${filename})`)
    console.error(`    ${error.message}`)
    errorCount++
  } else {
    console.log(`  ✓ ${title}`)
    successCount++
  }
}

console.log(`\n───────────────────────────────────`)
console.log(`Seeded:  ${successCount} songs`)
if (errorCount > 0) {
  console.error(`Errors:  ${errorCount} songs`)
  process.exit(1)
} else {
  console.log(`Errors:  0`)
}
