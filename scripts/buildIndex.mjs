import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  buildMetaPresence,
  inheritTranslationMetadata,
  stripSongIndexInternalFields,
} from '../src/utils/songs/songMetadata.js'

const root = process.cwd()
const songsDir = path.join(root, 'public', 'songs')
const outFile = path.join(root, 'src', 'data', 'index.json')

const files = (await fs.readdir(songsDir))
  .filter(f=> f.endsWith('.chordpro'))
  // Ignore local sample/test files prefixed with "test_" so they don't ship
  .filter(f=> !/^test_/i.test(f))

const items = []
const ACRONYM_TAG_KEYS = new Set(['icp'])
function normalizeTagKey(tag){
  return String(tag || '').trim().toLowerCase().replace(/\s+/g, ' ')
}
function tagLabelFromKey(key){
  if (!key) return ''
  if (ACRONYM_TAG_KEYS.has(key)) return key.toUpperCase()
  return key.charAt(0).toUpperCase() + key.slice(1)
}
function parseTags(val){
  const raw = String(val || '')
  if (!raw.trim()) return []
  const seen = new Set()
  const out = []
  for (const part of raw.split(/[,;]/)) {
    const key = normalizeTagKey(part)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(tagLabelFromKey(key))
  }
  return out
}

const LANGUAGE_ALIASES = {
  en: 'en',
  eng: 'en',
  tr: 'tr',
  tur: 'tr',
  ar: 'ar',
  ara: 'ar',
  es: 'es',
  spa: 'es',
  sp: 'es',
}
function normalizeLanguageCode(value, fallback = 'en'){
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return fallback
  if (LANGUAGE_ALIASES[raw]) return LANGUAGE_ALIASES[raw]
  const base = raw.split(/[-_]/)[0]
  return LANGUAGE_ALIASES[base] || base || fallback
}
function slugify(value){
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

for(const filename of files){
  const full = path.join(songsDir, filename)
  const text = await fs.readFile(full, 'utf8')
  const meta = parseMeta(text)
  const fallbackId = slugify(meta.title || filename.replace(/\.chordpro$/i, '')) || filename.replace(/\.chordpro$/i, '')
  const id = slugify(meta.id || fallbackId) || fallbackId
  const songIdRaw =
    meta.song_id ||
    meta.songid ||
    meta.translation_group ||
    meta.translationgroup ||
    meta.group ||
    meta.translation_of ||
    meta.translationof
  const songId = slugify(songIdRaw || id) || id
  // Canonical language tag is `{lang: xx}`.
  // Keep legacy key support while existing files migrate.
  const language = normalizeLanguageCode(meta.lang || meta.language || meta.locale || 'en')
  const addedAt = parseAdded(meta.added || meta.addedat)

  const analysis = analyzeSong(text, meta)

  items.push({
    id,
    songId,
    language,
    title: meta.title || id || filename.replace(/\.chordpro$/,''),
    filename,
    originalKey: meta.key || '',
    tags: parseTags(meta.tags),
    authors: (meta.authors||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean),
    country: meta.country||'',
    youtube: meta.youtube || '',
    mp3: meta.mp3 || '',
    pptx: meta.pptx || '',
    addedAt: addedAt || undefined,
    incomplete: false,
    _metaPresence: buildMetaPresence(meta),
    _analysis: analysis,
  })
}
function normalizeTitleForSort(title = ''){
  const t = String(title || '').trim()
  const t2 = t.replace(/^[^A-Za-z0-9]+/, '') || t
  return t2
}
function compareSongsByTitle(a, b){
  const aa = normalizeTitleForSort(a?.title || '')
  const bb = normalizeTitleForSort(b?.title || '')
  const aNum = /^[0-9]/.test(aa)
  const bNum = /^[0-9]/.test(bb)
  if (aNum !== bNum) return aNum ? -1 : 1
  return aa.localeCompare(bb, undefined, { sensitivity: 'base' })
}
items.sort((a, b) => {
  const bySong = compareSongsByTitle({ title: a.songId }, { title: b.songId })
  if (bySong !== 0) return bySong
  if (a.language !== b.language) return a.language.localeCompare(b.language)
  return compareSongsByTitle(a, b)
})
inheritTranslationMetadata(items)

const incompleteReport = []
const optionalReport = []
for (const item of items) {
  const analysis = item._analysis || { hasLyrics: true, hasChords: true }
  const reasons = []
  if (!item.originalKey) reasons.push('missing key')
  if (!analysis.hasLyrics) reasons.push('missing lyrics')
  if (!analysis.hasChords) reasons.push('missing chords')
  item.incomplete = reasons.length > 0
  if (item.incomplete) {
    incompleteReport.push({
      title: item.title || item.id || item.filename || 'Untitled',
      reasons,
    })
    continue
  }
  const missing = []
  if (!(item.tags || []).length) missing.push('tags')
  if (!(item.authors || []).length) missing.push('authors')
  if (!item.country) missing.push('country')
  if (!item.youtube) missing.push('youtube')
  if (missing.length) {
    optionalReport.push({
      title: item.title || item.id || item.filename || 'Untitled',
      missing,
    })
  }
}

await fs.mkdir(path.dirname(outFile), { recursive: true })
const outputItems = stripSongIndexInternalFields(items)
const languages = Array.from(new Set(outputItems.map((s) => s.language))).sort((a, b) => a.localeCompare(b))
await fs.writeFile(outFile, JSON.stringify({ languages, items: outputItems }, null, 2), 'utf8')
console.log(`Wrote ${outputItems.length} songs to ${outFile}`)

// Write human-readable report
const reportLines = []
const incompleteCount = incompleteReport.length
const completeCount = outputItems.length - incompleteCount
reportLines.push('GraceChords Song Metadata Report')
reportLines.push(`Generated: ${new Date().toISOString()}`)
reportLines.push(`Total songs: ${outputItems.length}`)
reportLines.push(`Complete: ${completeCount}`)
reportLines.push(`Incomplete: ${incompleteCount}`)
reportLines.push('')
if (incompleteReport.length) {
  reportLines.push('Incomplete songs (missing key and/or lyrics/chords):')
  for (const it of incompleteReport.sort((a,b)=> a.title.localeCompare(b.title))) {
    reportLines.push(`- ${it.title} — ${it.reasons.join('; ')}`)
  }
} else {
  reportLines.push('Incomplete songs (missing key and/or lyrics/chords): none')
}
reportLines.push('')
if (optionalReport.length) {
  reportLines.push('Complete songs with missing optional metadata (not hidden):')
  for (const it of optionalReport.sort((a,b)=> a.title.localeCompare(b.title))) {
    reportLines.push(`- ${it.title} — missing ${it.missing.join(', ')}`)
  }
} else {
  reportLines.push('Complete songs with missing optional metadata: none')
}
reportLines.push('')
const reportPath = path.join(root, 'song_metadata_report.txt')
await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8')
console.log(`Wrote metadata report to ${reportPath}`)

function parseMeta(text){ const meta={}; const re=/^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/gm; let m; while((m=re.exec(text))){ meta[m[1].trim().toLowerCase()] = m[2].trim() } return meta }
function parseBoolean(val){
  if (val === undefined || val === null) return false
  const v = String(val).trim().toLowerCase()
  if (!v) return false
  return ['1','true','yes','y','on'].includes(v)
}
function parseAdded(val){
  if (!val) return ''
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

function analyzeSong(text){
  const lines = (text || '').split(/\r?\n/)
  let hasLyrics = false
  const chordRe = /\[[^\]]+\]/
  let hasChords = chordRe.test(text || '')
  for (const raw of lines){
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('{') && line.endsWith('}')) continue // directive
    if (/^\s*#/.test(line)) continue // comment
    // remove chord tokens then test for letters
    const noChords = line.replace(chordRe, '').trim()
    if (/\p{L}/u.test(noChords)) hasLyrics = true
    if (hasLyrics && hasChords) break
  }
  return { hasLyrics, hasChords }
}
