import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const songsDir = path.join(root, 'public', 'songs')
const outFile = path.join(root, 'src', 'data', 'index.json')

const files = (await fs.readdir(songsDir))
  .filter(f=> f.endsWith('.chordpro'))
  // Ignore local sample/test files prefixed with "test_" so they don't ship
  .filter(f=> !/^test_/i.test(f))

const items = []
const incompleteReport = []
const optionalReport = []

for(const filename of files){
  const full = path.join(songsDir, filename)
  const text = await fs.readFile(full, 'utf8')
  const meta = parseMeta(text)
  const id = (meta.id || (meta.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')).replace(/(^-|-$)/g,'')
  const addedAt = parseAdded(meta.added || meta.addedat)

  const analysis = analyzeSong(text, meta)
  const incomplete = analysis.incomplete

  if (incomplete) {
    incompleteReport.push({
      title: meta.title || id || filename.replace(/\.chordpro$/,''),
      filename,
      reasons: analysis.reasons
    })
  } else if (analysis.optionalMissing.length) {
    optionalReport.push({
      title: meta.title || id || filename.replace(/\.chordpro$/,''),
      filename,
      missing: analysis.optionalMissing
    })
  }

  items.push({
    id,
    title: meta.title || id || filename.replace(/\.chordpro$/,''),
    filename,
    originalKey: meta.key || '',
    tags: (meta.tags||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean),
    authors: (meta.authors||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean),
    country: meta.country||'',
    addedAt: addedAt || undefined,
    incomplete
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
items.sort(compareSongsByTitle)
await fs.mkdir(path.dirname(outFile), { recursive: true })
await fs.writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2), 'utf8')
console.log(`Wrote ${items.length} songs to ${outFile}`)

// Write human-readable report
const reportLines = []
reportLines.push('GraceChords Song Metadata Report')
reportLines.push(`Generated: ${new Date().toISOString()}`)
reportLines.push('')
if (incompleteReport.length) {
  reportLines.push('Incomplete songs (missing key and/or lyrics/chords):')
  for (const it of incompleteReport.sort((a,b)=> a.title.localeCompare(b.title))) {
    reportLines.push(`- ${it.title} (${it.filename}) — ${it.reasons.join('; ')}`)
  }
} else {
  reportLines.push('Incomplete songs (missing key and/or lyrics/chords): none')
}
reportLines.push('')
if (optionalReport.length) {
  reportLines.push('Complete songs with missing optional metadata (not hidden):')
  for (const it of optionalReport.sort((a,b)=> a.title.localeCompare(b.title))) {
    reportLines.push(`- ${it.title} (${it.filename}) — missing ${it.missing.join(', ')}`)
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

function analyzeSong(text, meta){
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
    if (/[A-Za-z]/.test(noChords)) hasLyrics = true
    if (hasLyrics && hasChords) break
  }
  const reasons = []
  if (!meta.key) reasons.push('missing key')
  if (!hasLyrics) reasons.push('missing lyrics')
  if (!hasChords) reasons.push('missing chords')
  const incomplete = reasons.length > 0
  const optionalMissing = []
  if (!meta.tags) optionalMissing.push('tags')
  if (!meta.authors) optionalMissing.push('authors')
  if (!meta.country) optionalMissing.push('country')
  if (!meta.youtube) optionalMissing.push('youtube')
  return { incomplete, reasons, optionalMissing }
}
