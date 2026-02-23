import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { downloadSingleSongJpg } from '../src/utils/media/image.js'
import { stepsBetween, transposeSymPrefer } from '../src/utils/chordpro/index.js'
import { transposeInstrumental } from '../src/utils/songs/instrumental.js'

const args = parseArgs(process.argv.slice(2))
if (args.help || !args.out) {
  printUsage(args.out ? 0 : 1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const outDir = path.resolve(process.cwd(), args.out)

await fs.mkdir(outDir, { recursive: true })

const { createCanvas, GlobalFonts } = await loadCanvasLib()
const fonts = registerFonts(GlobalFonts, repoRoot)

const exportOptions = {
  createCanvas,
  fonts,
  dpi: args.dpi,
  widthInches: args.width,
  heightInches: args.height,
  quality: args.quality,
}

const entries = await loadEntries(repoRoot)
const selected = filterEntries(entries, args.only, args.limit)

if (!selected.length) {
  console.log('No songs matched the selection.')
  process.exit(0)
}

const summary = {
  total: selected.length,
  written: 0,
  skippedExisting: 0,
  skippedMultiPage: 0,
  failed: [],
}

for (let i = 0; i < selected.length; i += 1) {
  const entry = selected[i]
  const slug = String(entry.filename || '').replace(/\.chordpro$/i, '') || entry.id || `song_${i + 1}`
  const outFile = path.join(outDir, `${slug}.jpg`)

  if (args.skipExisting) {
    try {
      await fs.access(outFile)
      summary.skippedExisting += 1
      console.log(`[${i + 1}/${summary.total}] ${slug}: already exists, skipped`)
      continue
    } catch {}
  }

  const songPath = path.join(repoRoot, 'public', 'songs', entry.filename)
  let raw
  try {
    raw = await fs.readFile(songPath, 'utf8')
  } catch (err) {
    summary.failed.push({ slug, reason: `missing file (${entry.filename})` })
    console.log(`[${i + 1}/${summary.total}] ${slug}: missing song file`)
    continue
  }

  let doc
  try {
    doc = parseChordProOrLegacy(raw)
  } catch (err) {
    summary.failed.push({ slug, reason: 'parse error' })
    console.log(`[${i + 1}/${summary.total}] ${slug}: parse error`)
    continue
  }

  const title = doc?.meta?.title || entry.title || slug
  const baseKey = doc?.meta?.key || doc?.meta?.originalkey || entry.originalKey || 'C'
  const targetKey = args.key || baseKey
  const baseRootRaw = (String(baseKey).match(/^([A-G][#b]?)/) || [,''])[1]
  const preferFlat = !!(baseRootRaw && /b$/.test(baseRootRaw))
  const steps = stepsBetween(baseKey, targetKey)

  const sections = (doc.sections || []).map((sec) => ({
    ...sec,
    lines: (sec.lines || []).map((ln) => {
      if (ln.instrumental) {
        return { ...ln, instrumental: transposeInstrumental(ln.instrumental, steps, preferFlat) }
      }
      if (ln.comment) return ln
      if (!steps) return ln
      const chords = (ln.chords || []).map((c) => ({
        ...c,
        sym: transposeSymPrefer(c.sym, steps, preferFlat),
      }))
      return { ...ln, chords }
    })
  }))

  const song = {
    title,
    key: targetKey,
    capo: doc?.meta?.capo,
    layoutHints: doc?.layoutHints,
    sections,
  }

  try {
    const res = await downloadSingleSongJpg(song, { ...exportOptions, slug })
    if (res?.error === 'MULTI_PAGE') {
      summary.skippedMultiPage += 1
      console.log(`[${i + 1}/${summary.total}] ${slug}: multi-page, skipped`)
      continue
    }
    if (!res?.blob) throw new Error('missing blob')
    const outName = res.filename || `${slug}.jpg`
    const buffer = Buffer.from(await res.blob.arrayBuffer())
    await fs.writeFile(path.join(outDir, outName), buffer)
    summary.written += 1
    console.log(`[${i + 1}/${summary.total}] ${slug}: wrote ${outName}`)
  } catch (err) {
    summary.failed.push({ slug, reason: err?.message || 'export failed' })
    console.log(`[${i + 1}/${summary.total}] ${slug}: export failed`)
  }
}

console.log('')
console.log('Export summary')
console.log(`Total: ${summary.total}`)
console.log(`Written: ${summary.written}`)
console.log(`Skipped (existing): ${summary.skippedExisting}`)
console.log(`Skipped (multi-page): ${summary.skippedMultiPage}`)
console.log(`Failed: ${summary.failed.length}`)
if (summary.failed.length) {
  summary.failed.slice(0, 20).forEach((f) => {
    console.log(`- ${f.slug}: ${f.reason}`)
  })
  if (summary.failed.length > 20) {
    console.log(`- ...and ${summary.failed.length - 20} more`)
  }
}

function parseArgs(argv) {
  let out = null
  const only = []
  let limit
  let skipExisting = false
  let dpi = 150
  let width = 8.5
  let height = 11
  let quality = 0.92
  let key
  let help = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--out' || arg === '-o') {
      out = argv[i + 1]
      i += 1
    } else if (arg === '--only') {
      const raw = argv[i + 1]
      i += 1
      if (raw) {
        raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => only.push(s))
      }
    } else if (arg === '--limit') {
      const n = parseInt(argv[i + 1], 10)
      i += 1
      if (!Number.isNaN(n)) limit = n
    } else if (arg === '--skip-existing') {
      skipExisting = true
    } else if (arg === '--dpi') {
      const n = parseInt(argv[i + 1], 10)
      i += 1
      if (!Number.isNaN(n)) dpi = n
    } else if (arg === '--width') {
      const n = parseFloat(argv[i + 1])
      i += 1
      if (!Number.isNaN(n)) width = n
    } else if (arg === '--height') {
      const n = parseFloat(argv[i + 1])
      i += 1
      if (!Number.isNaN(n)) height = n
    } else if (arg === '--quality') {
      const n = parseFloat(argv[i + 1])
      i += 1
      if (!Number.isNaN(n)) quality = n
    } else if (arg === '--key') {
      key = argv[i + 1]
      i += 1
    }
  }

  return { out, only, limit, skipExisting, dpi, width, height, quality, key, help }
}

function printUsage(code) {
  console.log('Usage: node scripts/exportAllJpgs.mjs --out <dir> [options]')
  console.log('')
  console.log('Options:')
  console.log('  --out, -o         Output directory (required)')
  console.log('  --only            Comma-separated slugs to export')
  console.log('  --limit           Export first N songs')
  console.log('  --skip-existing   Skip files that already exist')
  console.log('  --dpi             DPI (default 150)')
  console.log('  --width           Page width in inches (default 8.5)')
  console.log('  --height          Page height in inches (default 11)')
  console.log('  --quality         JPEG quality 0-1 (default 0.92)')
  console.log('  --key             Transpose all songs to key')
  console.log('  --help, -h        Show help')
  process.exit(code)
}

async function loadCanvasLib() {
  try {
    const mod = await import('@napi-rs/canvas')
    return { createCanvas: mod.createCanvas, GlobalFonts: mod.GlobalFonts }
  } catch (err) {
    console.error('Missing dependency: @napi-rs/canvas')
    console.error('Install it with: npm i -D @napi-rs/canvas')
    process.exit(1)
  }
}

function registerFonts(GlobalFonts, repoRoot) {
  if (!GlobalFonts?.registerFromPath) {
    console.warn('Canvas font registration unavailable. Falling back to default fonts.')
    return { lyricFamily: 'Helvetica', chordFamily: 'Courier' }
  }

  const fontsDir = path.join(repoRoot, 'public', 'fonts')
  const reg = (file, family) => {
    const full = path.join(fontsDir, file)
    try {
      GlobalFonts.registerFromPath(full, family)
      return true
    } catch {
      return false
    }
  }

  const okSans = [
    reg('NotoSans-Regular.ttf', 'NotoSans'),
    reg('NotoSans-Bold.ttf', 'NotoSans'),
    reg('NotoSans-Italic.ttf', 'NotoSans'),
    reg('NotoSans-BoldItalic.ttf', 'NotoSans'),
  ].some(Boolean)

  const okMono = [
    reg('NotoSansMono-Regular.ttf', 'NotoSansMono'),
    reg('NotoSansMono-Bold.ttf', 'NotoSansMono'),
  ].some(Boolean)

  if (!okSans || !okMono) {
    console.warn('Some Noto fonts failed to load. Falling back to default fonts.')
    return { lyricFamily: 'Helvetica', chordFamily: 'Courier' }
  }

  return { lyricFamily: 'NotoSans', chordFamily: 'NotoSansMono' }
}

async function loadEntries(repoRoot) {
  const indexPath = path.join(repoRoot, 'src', 'data', 'index.json')
  try {
    const raw = await fs.readFile(indexPath, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.items) ? data.items : []
  } catch {
    const songsDir = path.join(repoRoot, 'public', 'songs')
    const files = await fs.readdir(songsDir)
    return files
      .filter((f) => f.toLowerCase().endsWith('.chordpro'))
      .map((f) => ({ id: f.replace(/\.chordpro$/i, ''), title: f, filename: f }))
  }
}

function filterEntries(entries, only, limit) {
  let out = entries.slice()
  if (only?.length) {
    const set = new Set(only.map((s) => s.replace(/\.chordpro$/i, '')))
    out = out.filter((e) => set.has(String(e.id)) || set.has(String(e.filename || '').replace(/\.chordpro$/i, '')))
  }
  if (typeof limit === 'number') out = out.slice(0, limit)
  return out
}

const RX_LONG_DIR = /^\{(start_of|end_of)_(verse|chorus|bridge|intro|tag|outro)(?::\s*([^}]+))?\}$/i
const RX_SHORT_DIR = /^\{\s*(sov|eov|soc|eoc|sob|eob)(?::?\s*([^}]+))?\s*\}$/i
const RX_CAPO = /^\{capo:\s*(\d+)\}$/i
const RX_COLUMNS = /^\{columns:\s*(\d+)\}$/i
const RX_COL_BREAK = /^\{column_break\}$/i
const RX_COMMENT = /^\{\s*(c|comment|com|ment)(?=\s|:)(?::?\s*([^}]+))?\s*\}$/i
const RX_INSTRUMENTAL = /^\{\s*(instrumental|inst|i)(?=\s|:|})(?::?\s*([^}]+))?\s*\}$/i
const RX_DEFINE = /^\{define:\s*([^}]+)\}$/i
const SHORT_MAP = {
  sov: { start: true,  kind: 'verse' },
  eov: { start: false, kind: 'verse' },
  soc: { start: true,  kind: 'chorus' },
  eoc: { start: false, kind: 'chorus' },
  sob: { start: true,  kind: 'bridge' },
  eob: { start: false, kind: 'bridge' },
}
const RX_PLAIN_HEADER = /^(verse|chorus|bridge|intro|tag|outro)(?:\s+(\d+))?$/i
const RX_META = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}$/
const RX_CHORD = /\[([^\]]+)\]/g

function parseInline(line) {
  const chords = []
  let plain = ''
  let last = 0
  line.replace(RX_CHORD, (match, sym, offset) => {
    plain += line.slice(last, offset)
    chords.push({ sym, index: plain.length })
    last = offset + match.length
    return match
  })
  plain += line.slice(last)
  return { lyrics: plain, chords }
}

function isPlainHeader(line) {
  return RX_PLAIN_HEADER.test(line.trim())
}

function normalizePlainHeader(line) {
  const m = RX_PLAIN_HEADER.exec(line.trim())
  if (!m) return { kind: 'verse', label: '' }
  const kind = m[1].toLowerCase()
  const label = m[2] ? `${capitalize(kind)} ${m[2]}` : capitalize(kind)
  return { kind, label }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function parseInstrumentalDirective(body) {
  const chords = []
  let repeat
  const raw = (body || '').trim()
  if (!raw) return { chords, repeat }

  const repeatToken = (token) => {
    const trimmed = token.trim()
    if (!trimmed) return { chord: '', rep: undefined }
    const directRepeat = trimmed.match(/^(.*?)(x\d+)$/i)
    if (directRepeat && directRepeat[1].trim()) {
      const chord = directRepeat[1].trim()
      const rep = parseInt(directRepeat[2].slice(1), 10)
      return { chord, rep: Number.isNaN(rep) ? undefined : rep }
    }
    return { chord: trimmed, rep: undefined }
  }

  const assignRepeat = (token) => {
    if (/^x\d+$/i.test(token.trim())) {
      const rep = parseInt(token.trim().slice(1), 10)
      if (!Number.isNaN(rep)) repeat = rep
      return true
    }
    return false
  }

  const pushPart = (part) => {
    if (!part) return
    const { chord, rep } = repeatToken(part)
    if (chord) chords.push(chord)
    if (rep && !Number.isNaN(rep)) repeat = rep
  }

  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
    for (const part of parts) {
      pushPart(part)
    }
  } else {
    const tokens = raw.split(/\s+/).filter(Boolean)
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i]
      if (assignRepeat(tok)) continue
      const { chord, rep } = repeatToken(tok)
      if (chord) chords.push(chord)
      if (rep && !Number.isNaN(rep)) repeat = rep
    }
  }

  return { chords, repeat }
}

function parseDirective(raw) {
  const t = raw.trim()
  let m = RX_LONG_DIR.exec(t)
  if (m) {
    return {
      start: m[1].toLowerCase() === 'start_of',
      kind: m[2].toLowerCase(),
      label: (m[3] || '').trim() || undefined,
    }
  }
  m = RX_SHORT_DIR.exec(t)
  if (m) {
    const code = m[1].toLowerCase()
    const label = (m[2] || '').trim()
    const map = SHORT_MAP[code]
    if (map) return { start: map.start, kind: map.kind, label: map.start && label ? label : undefined }
  }
  return null
}

function parseChordProOrLegacy(input) {
  const lines = input.split(/\r?\n/)

  let hasEnv = false
  for (const L of lines) {
    const t = L.trim()
    if (RX_LONG_DIR.test(t) || RX_SHORT_DIR.test(t)) { hasEnv = true; break }
  }

  const doc = { meta: {}, sections: [], layoutHints: { columnBreakAfter: [] }, chordDefs: [] }
  let cur = null

  const openSection = (kind, label) => {
    if (cur) doc.sections.push(cur)
    const lbl = label || capitalize(kind)
    cur = { kind, label: lbl, lines: [] }
  }
  const closeSection = () => {
    if (cur) { doc.sections.push(cur); cur = null }
  }

  const insertStandaloneSection = (section) => {
    if (cur && cur.lines.length) {
      const resumeLabel = cur.label
      const resumeKind = cur.kind
      doc.sections.push(cur)
      cur = { kind: resumeKind, label: resumeLabel, lines: [] }
    }
    doc.sections.push(section)
  }

  for (const raw of lines) {
    const t = raw.trim()

    if (t.startsWith('#')) { continue }

    if (t === '') {
      if (cur) cur.lines.push({ lyrics: '', chords: [] })
      continue
    }

    let m
    if ((m = RX_CAPO.exec(t))) { doc.meta.capo = parseInt(m[1], 10); continue }
    if ((m = RX_COLUMNS.exec(t))) {
      const n = parseInt(m[1], 10)
      doc.layoutHints.requestedColumns = n === 2 ? 2 : 1
      continue
    }
    if (RX_COL_BREAK.test(t)) { doc.layoutHints.columnBreakAfter.push(doc.sections.length); continue }
    if ((m = RX_COMMENT.exec(t))) {
      const note = (m[2] || '').trim()
      if (!note) continue
      const commentSection = {
        kind: 'comment',
        label: '',
        lines: [{ lyrics: '', chords: [], comment: note }],
      }
      insertStandaloneSection(commentSection)
      continue
    }
    if ((m = RX_INSTRUMENTAL.exec(t))) {
      const spec = parseInstrumentalDirective(m[2] || '')
      const instLine = { lyrics: '', chords: [], instrumental: spec }
      const instSection = {
        kind: 'instrumental',
        label: 'Instrumental',
        lines: [instLine],
        instrumental: spec,
      }
      insertStandaloneSection(instSection)
      continue
    }
    if ((m = RX_DEFINE.exec(t))) {
      const body = m[1].trim()
      const name = body.split(/\s+/)[0]
      doc.chordDefs.push({ name, raw: `define: ${body}` })
      continue
    }

    const mMeta = RX_META.exec(t)
    if (mMeta && !RX_LONG_DIR.test(t) && !RX_SHORT_DIR.test(t)) {
      const key = mMeta[1].trim().toLowerCase()
      const val = mMeta[2].trim()
      if (key === 'title') doc.meta.title = val
      else if (key === 'key') doc.meta.key = val
      else if (key === 'capo') doc.meta.capo = parseInt(val, 10)
      else if (key === 'meta') {
        const [mk, ...rest] = val.split(/\s+/)
        if (mk) {
          if (!doc.meta.meta) doc.meta.meta = {}
          doc.meta.meta[mk.toLowerCase()] = rest.join(' ').trim()
        }
      } else {
        if (!doc.meta.meta) doc.meta.meta = {}
        doc.meta.meta[key] = val
      }
      continue
    }

    if (hasEnv) {
      const dir = parseDirective(t)
      if (dir) { dir.start ? openSection(dir.kind, dir.label) : closeSection(); continue }
      if (t.startsWith('{') && t.endsWith('}')) continue
      if (!cur) openSection('verse', 'Verse')
      cur.lines.push(parseInline(raw))
      continue
    }

    if (isPlainHeader(raw)) {
      const { kind, label } = normalizePlainHeader(raw)
      openSection(kind, label)
      continue
    }

    if (t.startsWith('{') && t.endsWith('}')) {
      continue
    }

    if (!cur) openSection('verse', 'Verse')
    cur.lines.push(parseInline(raw))
  }

  if (cur) closeSection()
  return doc
}
