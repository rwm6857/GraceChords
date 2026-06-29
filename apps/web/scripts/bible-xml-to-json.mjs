import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DEFAULTS = {
  xml: 'BIBLE_XML/EnglishESVBible.xml',
  id: 'esv',
  lang: 'en',
  label: 'ESV',
  name: 'English Standard Version',
  schema: 'auto',
  encoding: 'auto',
  outRoot: 'public/bible',
  manifest: 'public/bible/translations.json',
  noManifest: false,
  clean: true,
  dryRun: false,
}

const SUPPORTED_SCHEMAS = new Set(['auto', 'esv', 'osis', 'generic'])

const CANONICAL_BOOKS = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Esther',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Solomon',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation',
]

const BOOK_NUMBER_BY_KEY = new Map(
  CANONICAL_BOOKS.map((name, idx) => [normalizeBookKey(name), idx + 1])
)

const BOOK_ALIAS_TO_NUMBER = new Map([
  ['songofsongs', 22],
  ['songofsong', 22],
  ['songofthemostbeautifulsongs', 22],
  ['canticles', 22],
  ['actsoftheapostles', 44],
  ['actsapostles', 44],
  ['psalm', 19],
  ['revelations', 66],
])

const OSIS_BOOK_MAP = {
  Gen: 'Genesis',
  Exod: 'Exodus',
  Lev: 'Leviticus',
  Num: 'Numbers',
  Deut: 'Deuteronomy',
  Josh: 'Joshua',
  Judg: 'Judges',
  Ruth: 'Ruth',
  '1Sam': '1 Samuel',
  '2Sam': '2 Samuel',
  '1Kgs': '1 Kings',
  '2Kgs': '2 Kings',
  '1Chr': '1 Chronicles',
  '2Chr': '2 Chronicles',
  Ezra: 'Ezra',
  Neh: 'Nehemiah',
  Esth: 'Esther',
  Job: 'Job',
  Ps: 'Psalms',
  Prov: 'Proverbs',
  Eccl: 'Ecclesiastes',
  Song: 'Song of Solomon',
  Isa: 'Isaiah',
  Jer: 'Jeremiah',
  Lam: 'Lamentations',
  Ezek: 'Ezekiel',
  Dan: 'Daniel',
  Hos: 'Hosea',
  Joel: 'Joel',
  Amos: 'Amos',
  Obad: 'Obadiah',
  Jonah: 'Jonah',
  Mic: 'Micah',
  Nah: 'Nahum',
  Hab: 'Habakkuk',
  Zeph: 'Zephaniah',
  Hag: 'Haggai',
  Zech: 'Zechariah',
  Mal: 'Malachi',
  Matt: 'Matthew',
  Mark: 'Mark',
  Luke: 'Luke',
  John: 'John',
  Acts: 'Acts',
  Rom: 'Romans',
  '1Cor': '1 Corinthians',
  '2Cor': '2 Corinthians',
  Gal: 'Galatians',
  Eph: 'Ephesians',
  Phil: 'Philippians',
  Col: 'Colossians',
  '1Thess': '1 Thessalonians',
  '2Thess': '2 Thessalonians',
  '1Tim': '1 Timothy',
  '2Tim': '2 Timothy',
  Titus: 'Titus',
  Phlm: 'Philemon',
  Heb: 'Hebrews',
  Jas: 'James',
  '1Pet': '1 Peter',
  '2Pet': '2 Peter',
  '1John': '1 John',
  '2John': '2 John',
  '3John': '3 John',
  Jude: 'Jude',
  Rev: 'Revelation',
}

export async function runBibleXmlImport(defaultOverrides = {}, argv = process.argv.slice(2)){
  const rawOptions = parseArgs({ ...DEFAULTS, ...defaultOverrides }, argv)

  if (rawOptions.help) {
    printHelp()
    return
  }

  const sourceXml = path.resolve(rawOptions.xml)

  if (!fs.existsSync(sourceXml)) {
    throw new Error(`XML file not found: ${sourceXml}`)
  }

  const buffer = await fs.promises.readFile(sourceXml)
  const xml = decodeBuffer(buffer, rawOptions.encoding)
  const xmlHeader = parseBibleHeader(xml)
  const options = finalizeOptions(rawOptions, xmlHeader)

  if (!SUPPORTED_SCHEMAS.has(options.schema)) {
    throw new Error(`Unsupported schema "${options.schema}". Use: auto, esv, osis, generic.`)
  }

  const outputRoot = path.resolve(options.outRoot)
  const targetDir = path.join(outputRoot, options.lang, options.id)
  const manifestPath = path.resolve(options.manifest)
  const parsed = parseBibleXml(xml, options.schema)

  if (!parsed.chapters.length) {
    throw new Error(
      `Unable to parse any chapters using schema "${parsed.schema}". Try --schema esv, --schema osis, or --schema generic.`
    )
  }

  if (options.dryRun) {
    const first = parsed.chapters[0]
    console.log(`[dry-run] schema=${parsed.schema}`)
    console.log(`[dry-run] parsed books=${parsed.bookCount}, chapters=${parsed.chapters.length}`)
    console.log(
      `[dry-run] translation metadata: id=${options.id}, label=${options.label}, name=${options.name}, lang=${options.lang}`
    )
    console.log(`[dry-run] first chapter: ${first.book} ${first.chapter} (${Object.keys(first.verses).length} verses)`)
  } else {
    if (options.clean) {
      await fs.promises.rm(targetDir, { recursive: true, force: true })
    }
    await writeChapters(targetDir, parsed.chapters)
    console.log(`Wrote ${parsed.chapters.length} chapters into ${targetDir} (schema=${parsed.schema})`)
  }

  if (!options.noManifest) {
    const dataRoot = computeDataRoot(options, targetDir)
    if (!options.dryRun) {
      await upsertManifest(manifestPath, {
        id: options.id,
        label: options.label,
        name: options.name,
        language: options.lang,
        dataRoot,
      })
      console.log(`Updated manifest: ${manifestPath}`)
    } else {
      console.log(`[dry-run] manifest entry -> id=${options.id}, language=${options.lang}, dataRoot=${dataRoot}`)
    }
  }
}

function parseArgs(defaults, argv){
  const out = { ...defaults }
  const provided = new Set()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const [rawKey, inlineValue] = token.split('=')
    const key = rawKey.trim()
    const nextValue = inlineValue != null ? inlineValue : argv[i + 1]
    const consumeNext = inlineValue == null && nextValue != null && !nextValue.startsWith('--')

    if (key === '--help' || key === '-h') {
      out.help = true
      continue
    }
    if (key === '--no-manifest') { out.noManifest = true; continue }
    if (key === '--dry-run') { out.dryRun = true; continue }
    if (key === '--no-clean') { out.clean = false; continue }
    if (key === '--clean') { out.clean = true; continue }

    if (
      key === '--xml'
      || key === '--id'
      || key === '--lang'
      || key === '--language'
      || key === '--label'
      || key === '--name'
      || key === '--schema'
      || key === '--encoding'
      || key === '--manifest'
      || key === '--out-root'
      || key === '--data-root'
    ) {
      if (!consumeNext && inlineValue == null) {
        throw new Error(`Missing value for ${key}`)
      }
      const value = String(nextValue || '').trim()
      if (!value) throw new Error(`Missing value for ${key}`)
      if (key === '--language') {
        out.lang = value
        provided.add('lang')
      } else if (key === '--out-root') {
        out.outRoot = value
      } else if (key === '--data-root') {
        out.dataRoot = value
      } else {
        const field = key.slice(2)
        out[field] = value
        if (field === 'lang' || field === 'id' || field === 'label' || field === 'name') {
          provided.add(field)
        }
      }
      if (consumeNext) i += 1
      continue
    }

    if (key.startsWith('--')) {
      throw new Error(`Unknown option: ${key}`)
    }
  }

  out.__provided = provided
  return out
}

function finalizeOptions(rawOptions, xmlHeader){
  const provided = rawOptions.__provided instanceof Set ? rawOptions.__provided : new Set()
  const next = { ...rawOptions }

  if (!provided.has('id')) {
    if (xmlHeader.abbreviation) next.id = xmlHeader.abbreviation
    else if (xmlHeader.translation) next.id = xmlHeader.translation
  }
  if (!provided.has('lang') && xmlHeader.lang) next.lang = xmlHeader.lang
  if (!provided.has('label') && xmlHeader.abbreviation) next.label = xmlHeader.abbreviation
  if (!provided.has('name') && xmlHeader.translation) next.name = xmlHeader.translation

  next.id = normalizeId(next.id)
  next.lang = normalizeLang(next.lang)
  next.schema = String(next.schema || 'auto').trim().toLowerCase()
  next.encoding = String(next.encoding || 'auto').trim().toLowerCase()
  next.label = String(next.label || next.id.toUpperCase()).trim() || next.id.toUpperCase()
  next.name = String(next.name || next.label).trim() || next.label

  delete next.__provided
  return next
}

function normalizeId(raw){
  const ascii = String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
  const cleaned = ascii
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
  if (!cleaned) throw new Error('Translation id is required (--id).')
  return cleaned
}

function normalizeLang(raw){
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  if (!cleaned) throw new Error('Language code is required (--lang).')
  return cleaned
}

function printHelp(){
  console.log([
    'Usage:',
    '  node scripts/bible-xml-to-json.mjs [options]',
    '',
    'Options:',
    '  --xml <path>          XML source file (default: BIBLE_XML/EnglishESVBible.xml)',
    '  --id <code>           Translation id (default: derived from XML abbreviation)',
    '  --lang <code>         Language code (default: derived from XML lang)',
    '  --label <text>        Short label shown in UI (default: derived from XML abbreviation)',
    '  --name <text>         Full translation name (default: derived from XML translation)',
    '  --schema <mode>       auto | esv | osis | generic (default: auto)',
    '  --encoding <enc>      auto | utf8 | latin1 (default: auto)',
    '  --out-root <path>     Output root (default: public/bible)',
    '  --manifest <path>     Translation manifest path (default: public/bible/translations.json)',
    '  --data-root <path>    Override manifest dataRoot value',
    '  --no-manifest         Skip manifest update',
    '  --no-clean            Do not delete previous output directory before write',
    '  --dry-run             Parse and report only, do not write files',
    '',
    'Examples:',
    '  npm run build:bibles',
    '  npm run build:bible -- --xml ./BIBLE_XML/EnglishESVBible.xml',
    '  node scripts/bible-xml-to-json.mjs --xml NLT.xml --id nlt --lang en --label NLT --name "New Living Translation"',
    '  node scripts/bible-xml-to-json.mjs --xml turkish.xml --id ykc --lang tr --label YKC --name "Yeni Kutsal Çeviri" --schema auto',
  ].join('\n'))
}

function parseBibleHeader(xml){
  const openTag = String(xml || '').match(/<bible\b([^>]*)>/i)
  if (!openTag) return { translation: '', abbreviation: '', lang: '' }
  const attrs = parseXmlAttributes(openTag[1])
  return {
    translation: decodeXml(attrs.translation || '').trim(),
    abbreviation: decodeXml(attrs.abbreviation || '').trim(),
    lang: decodeXml(attrs.lang || '').trim(),
  }
}

function parseXmlAttributes(rawAttrs){
  const attrs = {}
  const attrRe = /([a-zA-Z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match
  while ((match = attrRe.exec(String(rawAttrs || '')))) {
    const key = String(match[1] || '').toLowerCase()
    const value = match[2] != null ? match[2] : (match[3] || '')
    attrs[key] = value
  }
  return attrs
}

function decodeBuffer(buffer, encoding){
  if (encoding && encoding !== 'auto') return buffer.toString(encoding)

  const head = buffer.toString('ascii', 0, 240)
  const declared = (head.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i) || [])[1]
  if (declared && /iso-8859-1|latin-?1/i.test(declared)) return buffer.toString('latin1')

  return buffer.toString('utf8')
}

function parseBibleXml(xml, requestedSchema){
  const schemaOrder = requestedSchema === 'auto'
    ? ['esv', 'osis', 'generic']
    : [requestedSchema]

  for (const schema of schemaOrder) {
    const parsed = parseBySchema(xml, schema)
    if (parsed.chapters.length) return { ...parsed, schema }
  }
  return { schema: requestedSchema, chapters: [], bookCount: 0 }
}

function parseBySchema(xml, schema){
  if (schema === 'esv') return parseEsvLike(xml)
  if (schema === 'osis') return parseOsis(xml)
  return parseGeneric(xml)
}

function parseEsvLike(xml){
  const chapterMap = new Map()
  const order = []

  const bookRe = /<b\b[^>]*\b(?:n|number)\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/b>/gi
  const chapterRe = /<c\b[^>]*\b(?:n|number)\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/c>/gi
  const verseRe = /<v\b[^>]*\b(?:n|number)\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/v>/gi

  let bookMatch
  while ((bookMatch = bookRe.exec(xml))) {
    const book = normalizeBookName(bookMatch[1])
    if (!book.book) continue
    const bookBody = bookMatch[2]

    chapterRe.lastIndex = 0
    let chapterMatch
    while ((chapterMatch = chapterRe.exec(bookBody))) {
      const chapter = normalizeChapterNumber(chapterMatch[1])
      if (!chapter) continue
      const chapterBody = chapterMatch[2]

      verseRe.lastIndex = 0
      let verseMatch
      while ((verseMatch = verseRe.exec(chapterBody))) {
        const verse = normalizeVerseKey(verseMatch[1])
        if (!verse) continue
        const text = cleanVerseText(verseMatch[2])
        if (!text) continue
        upsertVerse(chapterMap, order, book, chapter, verse, text)
      }
    }
  }

  return finalizeChapters(chapterMap, order)
}

function parseOsis(xml){
  const chapterMap = new Map()
  const order = []

  const chapterRe = /<chapter\b[^>]*(?:osisID|osisid|n|number)\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/chapter>/gi
  const verseRe = /<verse\b[^>]*(?:osisID|osisid|n|number)\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/verse>/gi
  const milestoneVerseRe = /<verse\b[^>]*(?:sID|sid)\s*=\s*["']([^"']+)["'][^>]*\/>([\s\S]*?)<verse\b[^>]*(?:eID|eid)\s*=\s*["']([^"']+)["'][^>]*\/>/gi

  let chapterMatch
  while ((chapterMatch = chapterRe.exec(xml))) {
    const chapterRef = parseChapterRef(chapterMatch[1])
    if (!chapterRef) continue
    const chapterBody = chapterMatch[2]

    verseRe.lastIndex = 0
    let verseMatch
    while ((verseMatch = verseRe.exec(chapterBody))) {
      const verse = normalizeVerseKey(verseMatch[1])
      if (!verse) continue
      const text = cleanVerseText(verseMatch[2])
      if (!text) continue
      upsertVerse(chapterMap, order, chapterRef, chapterRef.chapter, verse, text)
    }

    milestoneVerseRe.lastIndex = 0
    let milestoneMatch
    while ((milestoneMatch = milestoneVerseRe.exec(chapterBody))) {
      const sid = milestoneMatch[1]
      const eid = milestoneMatch[3]
      if (!sid || !eid || sid !== eid) continue
      const verse = normalizeVerseKey(sid)
      if (!verse) continue
      const text = cleanVerseText(milestoneMatch[2])
      if (!text) continue
      upsertVerse(chapterMap, order, chapterRef, chapterRef.chapter, verse, text)
    }
  }

  return finalizeChapters(chapterMap, order)
}

function parseGeneric(xml){
  const chapterMap = new Map()
  const order = []

  const bookRe = /<(?:b|book)\b[^>]*(?:\b(?:n|name|number|osisID|osisid)\s*=\s*["']([^"']+)["'])[^>]*>([\s\S]*?)<\/(?:b|book)>/gi
  const chapterRe = /<(?:c|chapter)\b[^>]*(?:\b(?:n|number|osisID|osisid)\s*=\s*["']([^"']+)["'])[^>]*>([\s\S]*?)<\/(?:c|chapter)>/gi
  const verseRe = /<(?:v|verse)\b[^>]*(?:\b(?:n|number|osisID|osisid)\s*=\s*["']([^"']+)["'])[^>]*>([\s\S]*?)<\/(?:v|verse)>/gi

  let bookMatch
  while ((bookMatch = bookRe.exec(xml))) {
    const book = normalizeBookName(bookMatch[1])
    if (!book.book) continue
    const bookBody = bookMatch[2]

    chapterRe.lastIndex = 0
    let chapterMatch
    while ((chapterMatch = chapterRe.exec(bookBody))) {
      const chapter = normalizeChapterNumber(chapterMatch[1])
      if (!chapter) continue
      const chapterBody = chapterMatch[2]

      verseRe.lastIndex = 0
      let verseMatch
      while ((verseMatch = verseRe.exec(chapterBody))) {
        const verse = normalizeVerseKey(verseMatch[1])
        if (!verse) continue
        const text = cleanVerseText(verseMatch[2])
        if (!text) continue
        upsertVerse(chapterMap, order, book, chapter, verse, text)
      }
    }
  }

  return finalizeChapters(chapterMap, order)
}

function parseChapterRef(raw){
  const value = String(raw || '').trim()
  if (!value) return null
  const parts = value.split('.')
  if (parts.length >= 2) {
    const chapter = normalizeChapterNumber(parts[1])
    const book = normalizeBookName(parts[0])
    if (book.book && chapter) return { ...book, chapter }
  }
  return null
}

function normalizeBookName(raw){
  let value = String(raw || '').trim()
  if (!value) return { bookNumber: 0, book: '' }
  if (value.includes('.')) value = value.split('.')[0]
  const decoded = decodeXml(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (OSIS_BOOK_MAP[decoded]) return toBookRef(OSIS_BOOK_MAP[decoded])
  if (/^\d+$/.test(decoded)) {
    const number = Number(decoded)
    if (number >= 1 && number <= CANONICAL_BOOKS.length) {
      return { bookNumber: number, book: CANONICAL_BOOKS[number - 1] }
    }
  }

  return toBookRef(decoded)
}

function toBookRef(bookName){
  const book = String(bookName || '').trim()
  if (!book) return { bookNumber: 0, book: '' }
  const byName = bookNumberFromName(book)
  if (byName) return { bookNumber: byName, book: CANONICAL_BOOKS[byName - 1] || book }
  return { bookNumber: 0, book }
}

function bookNumberFromName(raw){
  const key = normalizeBookKey(raw)
  if (!key) return 0
  const exact = BOOK_NUMBER_BY_KEY.get(key)
  if (exact) return exact
  return BOOK_ALIAS_TO_NUMBER.get(key) || 0
}

function normalizeBookKey(raw){
  let cleaned = String(raw || '').trim()
  if (!cleaned) return ''
  const roman = cleaned.match(/^\s*(i{1,3})\b/i)
  if (roman) {
    const token = roman[1].toLowerCase()
    const num = token === 'i' ? '1' : token === 'ii' ? '2' : token === 'iii' ? '3' : token
    cleaned = cleaned.replace(roman[1], num)
  }
  return cleaned.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeChapterNumber(raw){
  const match = String(raw || '').match(/(\d+)/)
  if (!match) return 0
  const chapter = Number(match[1])
  return Number.isNaN(chapter) ? 0 : chapter
}

function normalizeVerseKey(raw){
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.includes('.')) {
    const last = value.split('.').at(-1)
    const match = String(last || '').match(/(\d+)/)
    if (match) return String(Number(match[1]))
  }
  const match = value.match(/(\d+)/)
  if (!match) return ''
  return String(Number(match[1]))
}

function cleanVerseText(raw){
  return decodeXml(stripXmlTags(String(raw || '')))
    .replace(/\s+/g, ' ')
    .trim()
}

function stripXmlTags(input){
  return String(input || '').replace(/<[^>]*>/g, ' ')
}

function decodeXml(str){
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => fromCodePointSafe(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCodePointSafe(parseInt(hex, 16)))
}

function fromCodePointSafe(value){
  try {
    return Number.isFinite(value) ? String.fromCodePoint(value) : ''
  } catch {
    return ''
  }
}

function upsertVerse(chapterMap, order, bookRef, chapter, verse, text){
  const bookNumber = Number(bookRef?.bookNumber) || 0
  const book = String(bookRef?.book || '').trim()
  const key = `${bookNumber || book}::${chapter}`
  if (!chapterMap.has(key)) {
    chapterMap.set(key, { bookNumber, book, chapter, verses: {} })
    order.push(key)
  }
  const chapterData = chapterMap.get(key)
  if (!chapterData.bookNumber && bookNumber) chapterData.bookNumber = bookNumber
  if (!chapterData.book && book) chapterData.book = book
  chapterData.verses[verse] = text
}

function finalizeChapters(chapterMap, order){
  const chapters = order
    .map((key) => chapterMap.get(key))
    .filter(Boolean)
    .map((chapter) => ({
      bookNumber: Number(chapter.bookNumber) || bookNumberFromName(chapter.book),
      book: chapter.book,
      chapter: chapter.chapter,
      verses: sortVerseMap(chapter.verses),
    }))
    .filter((chapter) => Object.keys(chapter.verses).length)

  for (const chapter of chapters) {
    if (!chapter.bookNumber && chapter.book) {
      chapter.bookNumber = bookNumberFromName(chapter.book)
    }
    if (chapter.bookNumber && !chapter.book) {
      chapter.book = CANONICAL_BOOKS[chapter.bookNumber - 1] || String(chapter.bookNumber)
    }
  }

  chapters.sort((a, b) => {
    const aBook = a.bookNumber || Number.MAX_SAFE_INTEGER
    const bBook = b.bookNumber || Number.MAX_SAFE_INTEGER
    if (aBook !== bBook) return aBook - bBook
    return a.chapter - b.chapter
  })

  const books = new Set(chapters.map((chapter) => chapter.bookNumber || chapter.book))
  return { chapters, bookCount: books.size }
}

function sortVerseMap(verses){
  return Object.fromEntries(
    Object.entries(verses || {}).sort((a, b) => Number(a[0]) - Number(b[0]))
  )
}

async function writeChapters(targetDir, chapters){
  await fs.promises.mkdir(targetDir, { recursive: true })
  for (const chapter of chapters) {
    const bookDirName = String(chapter.bookNumber || chapter.book)
    const bookDir = path.join(targetDir, bookDirName)
    await fs.promises.mkdir(bookDir, { recursive: true })
    const outPath = path.join(bookDir, `${chapter.chapter}.json`)
    await fs.promises.writeFile(outPath, JSON.stringify(chapter, null, 2))
  }
}

function computeDataRoot(options, targetDir){
  if (options.dataRoot) return normalizeDataRoot(options.dataRoot)
  const publicRoot = path.resolve('public')
  const rel = path.relative(publicRoot, targetDir)
  if (rel.startsWith('..')) {
    throw new Error(
      `Output directory is outside public/. Provide --data-root explicitly for manifest updates. target=${targetDir}`
    )
  }
  return normalizeDataRoot(rel)
}

function normalizeDataRoot(raw){
  return String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

async function upsertManifest(manifestPath, entry){
  const next = await readManifest(manifestPath)
  const idx = next.translations.findIndex((item) => item.id === entry.id)
  if (idx >= 0) next.translations[idx] = { ...next.translations[idx], ...entry }
  else next.translations.push(entry)

  next.translations.sort((a, b) => {
    const langDiff = String(a.language || '').localeCompare(String(b.language || ''), undefined, { sensitivity: 'base' })
    if (langDiff !== 0) return langDiff
    return String(a.name || a.label || a.id).localeCompare(String(b.name || b.label || b.id), undefined, { sensitivity: 'base' })
  })

  if (!next.defaultTranslation) next.defaultTranslation = entry.id

  await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
}

async function readManifest(manifestPath){
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, defaultTranslation: '', translations: [] }
  }
  const raw = await fs.promises.readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(raw)
  return {
    version: Number(parsed.version) || 1,
    defaultTranslation: String(parsed.defaultTranslation || ''),
    translations: Array.isArray(parsed.translations) ? parsed.translations : [],
  }
}

const IS_DIRECT = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (IS_DIRECT) {
  runBibleXmlImport().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
  })
}
