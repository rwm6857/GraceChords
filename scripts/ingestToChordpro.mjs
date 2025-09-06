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

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.log('Usage: node scripts/ingestToChordpro.mjs <file...> [--out public/songs] [--plain]')
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

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }) }

function slugify(s){
  return String(s||'').toLowerCase().replace(/[^\w]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')
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

function toChordProSkeleton({ title, body }){
  const head = [
    `{title: ${title}}`,
    `{key: }`,
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
    const mammoth = await import('mammoth').catch(()=> null)
    if (!mammoth) throw new Error('mammoth not installed')
    const res = await mammoth.default.extractRawText({ path: file })
    return res.value || ''
  } catch (e) {
    throw new Error(`DOCX parse failed (${e?.message||e})`)
  }
}

async function textFromPdf(file){
  try {
    const pdfParse = await import('pdf-parse').catch(()=> null)
    if (!pdfParse) throw new Error('pdf-parse not installed')
    const buf = await fs.readFile(file)
    const res = await pdfParse.default(buf)
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
  const structured = (mode === 'directives') ? toDirectiveSections(clean) : normalizeSectionHeaders(clean)
  const body = '\n' + structured + '\n'
  const chordpro = toChordProSkeleton({ title, body })
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
  const headerRx = /^(?:\[\s*)?\s*([A-Za-z][A-Za-z\-\s]*?)(?:\s*\])?\s*:?(?:\s*)$/
  function classify(h){
    const t = String(h||'').trim().replace(/\s+/g,' ')
    const lower = t.toLowerCase()
    // Extract base and number
    const m = /^(pre[-\s]?chorus|verse|chorus|bridge|intro|outro|tag|refrain|ending|instrumental)(?:\s+(\d+))?$/.exec(lower)
    if (!m) return { code: 'sob', end: 'eob', label: capitalCase(t) } // unknown → bridge label
    const base = m[1]
    const num = m[2]
    if (base === 'verse') return { code: 'sov', end: 'eov', label: num ? `Verse ${num}` : 'Verse' }
    if (base === 'chorus') return { code: 'soc', end: 'eoc', label: num ? `Chorus ${num}` : 'Chorus' }
    if (base.startsWith('pre')) return { code: 'soc', end: 'eoc', label: 'Pre-Chorus' }
    if (base === 'bridge') return { code: 'sob', end: 'eob', label: num ? `Bridge ${num}` : 'Bridge' }
    // Everything else → bridge with label
    return { code: 'sob', end: 'eob', label: capitalCase(t) }
  }
  function capitalCase(s){ return String(s||'').replace(/\b\w/g, c => c.toUpperCase()) }

  let open = null // { end: 'eov'|'eoc'|'eob' }
  function close(){ if (open){ out.push(`{${open.end}}`); open = null } }
  function openAs(sec){ out.push(`{${sec.code}: ${sec.label}}`); open = { end: sec.end } }

  // If there is leading content before any header, wrap it as a Verse
  let sawHeader = false
  for (let i=0; i<lines.length; i++){
    const raw = lines[i]
    const t = raw.trim()
    const isHeader = t && headerRx.test(t)
    if (isHeader){ sawHeader = true; break }
    if (t) { sawHeader = false; break }
  }
  // Process lines, emitting start/end markers around detected sections
  for (let i=0; i<lines.length; i++){
    const raw = lines[i]
    const t = raw.trim()
    if (!t){ out.push(''); continue }
    const m = headerRx.exec(t)
    if (m){
      const sec = classify(m[1])
      close()
      openAs(sec)
      continue
    }
    if (!open && sawHeader){
      // Leading content before the first header → default Verse
      openAs({ code: 'sov', end: 'eov', label: 'Verse' })
    }
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
  const headerRx = /^(?:\[\s*)?\s*([A-Za-z][A-Za-z\-\s]*?)(?:\s*\])?\s*:?(?:\s*)$/
  function capitalCase(s){ return String(s||'').replace(/\b\w/g, c => c.toUpperCase()) }
  function classifyLabel(h){
    const t = String(h||'').trim().replace(/\s+/g,' ')
    const lower = t.toLowerCase()
    const m = /^(pre[-\s]?chorus|verse|chorus|bridge|intro|outro|tag|refrain|ending|instrumental)(?:\s+(\d+))?$/.exec(lower)
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
    out.push(raw)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

(async function main(){
  await ensureDir(outDir)
  let ok = 0, fail = 0
  for (const input of inputs){
    try {
      const { fname, chordpro } = await ingestOne(input)
      const outPath = path.join(outDir, fname)
      await fs.writeFile(outPath, chordpro, 'utf8')
      console.log(`Wrote: ${outPath}`)
      ok++
    } catch (e) {
      console.error(`Failed: ${input} -> ${e?.message || e}`)
      fail++
    }
  }
  console.log(`Done. ${ok} file(s) written, ${fail} failed.`)
})().catch(e => { console.error(e); process.exit(1) })
