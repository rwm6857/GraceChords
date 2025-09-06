#!/usr/bin/env node
/**
 * Ingest external lyric sources (PDF/DOCX/TXT) and emit a ChordPro skeleton.
 *
 * Usage:
 *   node scripts/ingestToChordpro.mjs <input1> [input2 ...] [--out public/songs]
 *
 * Notes:
 * - DOCX: requires optional dependency `mammoth` (install with `npm i -D mammoth`).
 * - PDF:  requires optional dependency `pdf-parse` (install with `npm i -D pdf-parse`).
 * - Images (OCR): not enabled by default. If you need OCR, consider installing
 *   the `tesseract` CLI and wiring it in, or use `tesseract.js` offline bundles.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.log('Usage: node scripts/ingestToChordpro.mjs <file...> [--out <dir>] [--plain]')
  console.log('Default output: public/songs (must already exist).')
  process.exit(1)
}

function parseCli(args){
  let outDir = 'public/songs'
  let mode = 'directives'
  const inputs = []
  for (let i=0; i<args.length; i++){
    const a = args[i]
    if (a === '--out') { if (i+1 < args.length) { outDir = args[++i]; continue } }
    if (a === '--plain' || a === '--no-directives') { mode = 'plain'; continue }
    if (a === '--directives') { mode = 'directives'; continue }
    inputs.push(a)
  }
  return { outDir, mode, inputs }
}

const { outDir, mode, inputs } = parseCli(argv)

async function dirExists(p){ try { const s = await fs.stat(p); return s.isDirectory() } catch { return false } }

function slugify(s){
  return String(s||'')
    .toLowerCase()
    .replace(/[^\w]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function cleanupText(raw){
  const text = String(raw||'').replace(/\r\n/g,'\n')
  const lines = text.split('\n')
  const out = []
  for (let i=0; i<lines.length; i++){
    let ln = lines[i]
    // strip standalone page numbers
    if (/^\s*\d+\s*$/.test(ln)) continue
    // de-hyphenate common PDF linebreaks: "lyric-\nnext" -> "lyricnext"
    if (/-$/.test(ln) && i+1 < lines.length){
      const next = lines[i+1]
      out.push(ln.replace(/-$/, '') + next.replace(/^\s+/, ''))
      i++
      continue
    }
    out.push(ln)
  }
  // collapse >2 blank lines
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

function guessTitle(text){
  const lines = String(text||'').split(/\r?\n/).map(s=> s.trim()).filter(Boolean)
  if (!lines.length) return 'Untitled'
  // Heuristic: first non-empty line that is not a common section header
  const isHeader = /^(verse|chorus|bridge|tag|intro|outro|refrain)\b/i
  for (const ln of lines.slice(0, 10)){
    if (!isHeader.test(ln) && ln.length >= 3) return ln
  }
  // fallback: longest of first five lines
  return lines.slice(0,5).sort((a,b)=> b.length - a.length)[0] || 'Untitled'
}

function toChordProSkeleton({ title, key, body }){
  const head = [
    `{title: ${title}}`,
    `{key: ${key || ''}}`,
    `{authors: }`,
    `{country: }`,
    `{tags: }`,
    `{youtube: }`,
    `{mp3: }`,
    '',
  ]
  // Keep user text as-is; author can add sections later.
  return head.join('\n') + body
}

async function textFromDocx(file){
  try {
    const mod = await import('mammoth')
    const api = (mod?.default && mod.default.extractRawText) ? mod.default : mod
    if (!api?.extractRawText) throw new Error('mammoth not installed — run: npm i -D mammoth')
    const res = await api.extractRawText({ path: file })
    return res.value || ''
  } catch (e) {
    throw new Error(`DOCX parse failed (${e?.message||e})`)
  }
}

async function textFromPdf(file){
  try {
    // Try main entry, then explicit path for ESM interop.
    let parseFn = null
    try {
      const mod = await import('pdf-parse')
      parseFn = (mod?.default && typeof mod.default === 'function') ? mod.default : (typeof mod === 'function' ? mod : null)
    } catch (e1) {
      try {
        const mod2 = await import('pdf-parse/lib/pdf-parse.js')
        parseFn = (mod2?.default && typeof mod2.default === 'function') ? mod2.default : (typeof mod2 === 'function' ? mod2 : null)
      } catch (e2) {
        throw new Error(`pdf-parse not installed — run: npm i -D pdf-parse (details: ${e2?.message || e1?.message || 'unknown'})`)
      }
    }
    if (!parseFn) throw new Error('pdf-parse load failed')
    const buf = await fs.readFile(file)
    const res = await parseFn(buf)
    return res.text || ''
  } catch (e) {
    throw new Error(`PDF parse failed (${e?.message||e})`)
  }
}

async function textFromTxt(file){
  return fs.readFile(file, 'utf8')
}

async function ingestOne(file){
  const ext = path.extname(file).toLowerCase()
  let raw = ''
  if (ext === '.docx') raw = await textFromDocx(file)
  else if (ext === '.pdf') raw = await textFromPdf(file)
  else if (ext === '.txt') raw = await textFromTxt(file)
  else throw new Error(`Unsupported file type: ${ext}`)

  const clean = cleanupText(raw)
  const title = guessTitle(clean)
  const extracted = extractKeyAndStripLines(clean, title)
  const joined = extracted.lines.join('\n')
  const structured = (mode === 'directives') ? toDirectiveSections(joined) : normalizeSectionHeaders(joined)
  const body = '\n' + structured + '\n'
  const chordpro = toChordProSkeleton({ title, key: extracted.key, body })
  const fname = `${slugify(title)}.chordpro`
  return { fname, chordpro }
}

// ---- Section header detection → ChordPro directives ----
// Wrap sections using short directives: {sov: Verse 1}/{eov}, {soc: Chorus}/{eoc},
// {soc: Pre-Chorus}/{eoc}. Unknown headers (Intro, Tag, Instrumental, etc.) are
// treated as labeled bridges {sob: Label}/{eob}.
function toDirectiveSections(text){
  const lines = String(text||'').split(/\r?\n/)
  const out = []
  // Header patterns like: "[Verse 1]", "Verse 1:", "PRE-CHORUS", "Intro"
  const headerRx = /^(?:\[\s*)?\s*(pre[-\s]?chorus|verse|chorus|bridge|intro|outro|tag|refrain|ending|instrumental|interlude)(?:\s+(\d+))?\s*(?:\])?\s*:?\s*$/i
  function classify(base, num){
    const lower = String(base||'').toLowerCase()
    if (lower === 'verse') return { code: 'sov', end: 'eov', label: num ? `Verse ${num}` : 'Verse' }
    if (lower === 'chorus') return { code: 'soc', end: 'eoc', label: num ? `Chorus ${num}` : 'Chorus' }
    if (lower.startsWith('pre')) return { code: 'soc', end: 'eoc', label: 'Pre-Chorus' }
    if (lower === 'bridge') return { code: 'sob', end: 'eob', label: num ? `Bridge ${num}` : 'Bridge' }
    return { code: 'sob', end: 'eob', label: capitalCase(base) }
  }
  function isChordLine(t){
    const token = /^(?:[A-G](?:#|b)?(?:(?:maj|m|min|dim|aug|sus|add)?\d*)?(?:\/[A-G](?:#|b)?)?)(?:\([^)]+\))?$/
    const parts = t.split(/\s+/).filter(Boolean)
    if (!parts.length) return false
    const filt = parts.filter(p => !/^[-|]+$/.test(p))
    if (!filt.length) return false
    return filt.every(p => token.test(p))
  }
  function capitalCase(s){ return String(s||'').replace(/\b\w/g, c => c.toUpperCase()) }

  let open = null // { end: 'eov'|'eoc'|'eob' }
  function close(){ if (open){ out.push(`{${open.end}}`); open = null } }
  function openAs(sec){ out.push(`{${sec.code}: ${sec.label}}`); open = { end: sec.end } }

  // Process lines, emitting start/end markers around detected sections
  for (let i=0; i<lines.length; i++){
    const raw = lines[i]
    const t = raw.trim()
    if (!t){ out.push(''); continue }
    const m = headerRx.exec(t)
    if (m){
      const sec = classify(m[1], m[2])
      close()
      openAs(sec)
      continue
    }
    if (isChordLine(t)) continue
    if (!open){ openAs({ code: 'sov', end: 'eov', label: 'Verse' }) }
    out.push(raw)
  }
  close()
  // collapse >2 blank lines (outside directives)
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

// Plain header normalization: keep headers as readable labels (Verse N, Chorus, Pre-Chorus, Intro, Tag, etc.)
function normalizeSectionHeaders(text){
  const lines = String(text||'').split(/\r?\n/)
  const out = []
  const headerRx = /^(?:\[\s*)?\s*(pre[-\s]?chorus|verse|chorus|bridge|intro|outro|tag|refrain|ending|instrumental|interlude)(?:\s+(\d+))?\s*(?:\])?\s*:?\s*$/i
  function capitalCase(s){ return String(s||'').replace(/\b\w/g, c => c.toUpperCase()) }
  function classifyLabel(h){
    const t = String(h||'').trim().replace(/\s+/g,' ')
    const lower = t.toLowerCase()
    const m = /^(pre[-\s]?chorus|verse|chorus|bridge|intro|outro|tag|refrain|ending|instrumental|interlude)(?:\s+(\d+))?$/.exec(lower)
    if (!m) return capitalCase(t)
    const base = m[1]
    const num = m[2]
    if (base === 'verse') return num ? `Verse ${num}` : 'Verse'
    if (base === 'chorus') return num ? `Chorus ${num}` : 'Chorus'
    if (base.startsWith('pre')) return 'Pre-Chorus'
    if (base === 'bridge') return num ? `Bridge ${num}` : 'Bridge'
    return capitalCase(t)
  }
  for (let i=0; i<lines.length; i++){
    const raw = lines[i]
    const t = raw.trim()
    if (!t){ out.push(raw); continue }
    const m = headerRx.exec(t)
    if (m){
      const label = classifyLabel(m[1])
      if (out.length > 0 && String(out[out.length-1]).trim() !== '') out.push('')
      out.push(label)
      const nxt = lines[i+1]
      if (typeof nxt !== 'undefined' && String(nxt).trim() !== '') out.push('')
      continue
    }
    // drop chord-only lines in plain mode as well
    if (/^(?:[A-G](?:#|b)?(?:(?:maj|m|min|dim|aug|sus|add)?\d*)?(?:\/[A-G](?:#|b)?)?)(?:\s+|$)/.test(t) && !/[a-z]{2,}/i.test(t)) continue
    out.push(raw)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

// Extract key line like "(Key of G)" or "Key of Am" near the top; remove title duplicates.
function extractKeyAndStripLines(text, title){
  const lines = String(text||'').split(/\r?\n/)
  let key = ''
  const out = []
  const titleNorm = String(title||'').trim().toLowerCase()
  let seenContent = false
  for (let i=0; i<lines.length; i++){
    const raw = lines[i]
    const t = raw.trim()
    if (!t){ out.push(raw); continue }
    if (!seenContent && t.toLowerCase() === titleNorm){ seenContent = true; continue }
    const m = /^\(?\s*key\s+of\s+([A-Ga-g][#b]?(?:m)?)\s*\)?$/i.exec(t)
    if (m){ key = m[1].toUpperCase(); continue }
    out.push(raw)
    seenContent = true
  }
  return { key, lines: out }
}

(async function main(){
  if (!(await dirExists(outDir))){
    console.error(`[ingest] Output directory not found: ${outDir}`)
    console.error('Create it first or pass a custom path with --out <dir>.')
    process.exit(1)
  }
  const rl = readline.createInterface({ input, output })
  let ok = 0, fail = 0, skipped = 0
  for (const input of inputs){
    try {
      const { fname, chordpro } = await ingestOne(input)
      let targetName = fname
      let outPath = path.join(outDir, targetName)
      // Handle collisions interactively
      while (await fileExists(outPath)){
        const choice = await promptChoice(rl, `File exists: ${targetName}. Overwrite [o], Rename [r], Skip [s], Abort [a]? (o/r/s/a) `)
        if (choice === 'o') break
        if (choice === 's') { console.log(`Skipped: ${targetName}`); skipped++; throw new Error('__SKIP__') }
        if (choice === 'a') { console.log('Aborted by user.'); await rl.close(); process.exit(1) }
        if (choice === 'r'){
          const next = await rl.question('Enter new filename (without path, e.g., my_song.chordpro): ')
          let proposed = String(next || '').trim()
          if (!proposed) continue
          if (!/\.chordpro$/i.test(proposed)) proposed += '.chordpro'
          // basic sanitize to avoid nested paths
          proposed = proposed.replace(/[\\/]+/g, '_')
          targetName = proposed
          outPath = path.join(outDir, targetName)
          continue
        }
      }
      await fs.writeFile(outPath, chordpro, 'utf8')
      console.log(`Wrote: ${outPath}`)
      ok++
    } catch (e) {
      if (String(e?.message || e) !== '__SKIP__')
        console.error(`Failed: ${input} -> ${e?.message || e}`)
      fail++
    }
  }
  await rl.close()
  console.log(`Done. ${ok} written, ${skipped} skipped, ${fail} failed.`)
})().catch(e => { console.error(e); process.exit(1) })

async function fileExists(p){ try { await fs.access(p); return true } catch { return false } }

async function promptChoice(rl, q){
  while (true){
    const a = (await rl.question(q)).trim().toLowerCase()
    if (['o','r','s','a'].includes(a)) return a
    console.log('Please type one of: o, r, s, a')
  }
}
