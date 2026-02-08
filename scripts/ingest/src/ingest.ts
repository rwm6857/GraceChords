import { basename, extname, join, resolve, dirname } from 'node:path'
import { readFile, writeFile, readdir, stat, rename, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { classifyLine } from './utils/classify.js'
import { alignChordLineToLyrics, alignChordWordsToLyrics } from './utils/align.js'
import { isChordToken, normalizeChordLine } from './utils/chords.js'
import { normalizeChordPro } from './utils/normalize.js'
import { renderPreviewHtml } from './utils/preview.js'
import { slugifyTitle } from './utils/slug.js'
import { scoreExtraction } from './utils/report.js'
import type { Report } from './utils/report.js'
import { renderReportHtml } from './utils/reportHtml.js'
import { copyFileSafe, ensureDir, fileExists, readText, writeText } from './utils/fs.js'
import type { ExtractedLine, ExtractionResult } from './utils/types.js'
import { extractPdfHeader } from './utils/pdfHeader.js'
import { extractFromDocx } from './extractors/docx.js'
import { extractFromImage } from './extractors/image.js'
import { extractFromPdf } from './extractors/pdf.js'
import { extractOpenSong, isOpenSongXml } from './extractors/opensong.js'
import { extractFromText } from './extractors/text.js'

export type IngestOptions = {
  title?: string
  authors?: string
  key?: string
  tags?: string
  presentation?: string
}

export type IngestResult =
  | {
      stagingDir: string
      report: Report
      title: string
    }
  | {
      skipped: true
      reason: string
      title: string
    }

const distDir = (() => {
  try {
    const url = import.meta?.url
    if (url && url.startsWith('file:')) {
      return fileURLToPath(new URL('.', url))
    }
  } catch {}
  return resolve(process.cwd(), 'scripts/ingest/src')
})()
const packageRoot = resolve(distDir, '..')
const STAGING_ROOT = resolve(packageRoot, '_ingest_staging')
const runSlugCounts = new Map<string, number>()

const SUPPORTED_EXTENSIONS = ['.docx', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.xml', '']

function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input)
}

async function downloadToFile(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download ${url}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await ensureDir(dirname(targetPath))
  await writeFile(targetPath, buffer)
}

function extensionFromPath(path: string): string {
  return extname(path).toLowerCase()
}

async function renameToUnique(stagingDir: string, finalSlug: string): Promise<{ slug: string; path: string }> {
  await ensureDir(STAGING_ROOT)
  const runCount = runSlugCounts.get(finalSlug) || 0
  let attempt = runCount
  while (attempt < 1000) {
    const suffix = attempt === 0 ? '' : `_${attempt}`
    const targetDir = join(STAGING_ROOT, `${finalSlug}${suffix}`)
    try {
      if (await fileExists(targetDir)) {
        if (attempt === runCount) {
          await rm(targetDir, { recursive: true, force: true })
        } else {
          attempt += 1
          continue
        }
      }
      await rename(stagingDir, targetDir)
      runSlugCounts.set(finalSlug, attempt + 1)
      return { slug: basename(targetDir), path: targetDir }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOTEMPTY' || code === 'EEXIST') {
        attempt += 1
        continue
      }
      throw error
    }
  }
  throw new Error(`Unable to allocate unique staging dir for ${finalSlug}`)
}

async function chooseExtractor(path: string): Promise<ExtractionResult> {
  const ext = extensionFromPath(path)
  if (ext === '.docx') return await extractFromDocx(path)
  if (ext === '.pdf') return await extractFromPdf(path)
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return await extractFromImage(path)
  if (ext === '.txt' || ext === '.xml' || ext === '') {
    const raw = await readText(path)
    if (isOpenSongXml(raw)) return await extractOpenSong(path)
    return await extractFromText(path)
  }
  return {
    lines: [],
    warnings: [`Unsupported file extension: ${ext}`],
    stats: {},
    extractor: 'unknown'
  }
}

export function buildDraft(
  lines: ExtractedLine[],
  options: IngestOptions,
  warnings: string[]
): { text: string; stats: any } {
  const output: string[] = []
  const metaLines: string[] = []
  if (options.title) metaLines.push(`{title: ${options.title}}`)
  if (options.authors) metaLines.push(`{authors: ${options.authors}}`)
  if (options.key) metaLines.push(`{key: ${options.key}}`)
  if (options.tags) metaLines.push(`{tags: ${options.tags}}`)
  if (options.presentation) metaLines.push(`{comment: presentation: ${options.presentation}}`)
  if (metaLines.length > 0) output.push(...metaLines, '')

  let mappingAttempts = 0
  let mappingSuccess = 0
  let suspiciousInsertions = 0

  let chordLines = 0
  let lyricLines = 0
  let headingLines = 0

  let chordTokens = 0
  let tokenCount = 0

  const classified = lines.map((line) => ({
    ...line,
    type: classifyLine(line.text)
  }))

  const totalLines = classified.length

  for (let i = 0; i < classified.length; i += 1) {
    const line = classified[i]
    const lineType = line.type

    const tokens = line.text.trim().split(/\s+/).filter(Boolean)
    tokenCount += tokens.length
    chordTokens += tokens.filter((token) => isChordToken(token)).length

    if (lineType === 'heading') {
      headingLines += 1
      output.push(line.text.trim())
      continue
    }

    if (lineType === 'chords') {
      chordLines += 1
      let j = i + 1
      while (j < classified.length && classified[j].type === 'blank') {
        j += 1
      }
      const nextLine = classified[j]
      if (nextLine && nextLine.type === 'lyrics') {
        mappingAttempts += 1
        lyricLines += 1
        let result
        if (line.words && nextLine.words && line.words.length > 0 && nextLine.words.length > 0) {
          result = alignChordWordsToLyrics(line.words, nextLine.words, nextLine.text)
        } else {
          result = alignChordLineToLyrics(line.text, nextLine.text)
        }
        if (result.success) mappingSuccess += 1
        suspiciousInsertions += result.suspiciousInsertions
        output.push(result.line)
        i = j
        continue
      }

      warnings.push('Unmatched chord line kept without lyric pairing.')
      output.push(normalizeChordLine(line.text))
      continue
    }

    if (lineType === 'lyrics') {
      lyricLines += 1
      if (/\[[^\]]+\]/.test(line.text)) {
        output.push(normalizeChordLine(line.text))
      } else {
        output.push(line.text)
      }
      continue
    }

    output.push('')
  }

  const stats = {
    lineCount: totalLines,
    chordLines,
    lyricLines,
    headingLines,
    chordTokenRate: tokenCount > 0 ? chordTokens / tokenCount : 0,
    mappingSuccessRate: mappingAttempts > 0 ? mappingSuccess / mappingAttempts : 0,
    suspiciousInsertions
  }

  return { text: output.join('\n').trimEnd() + '\n', stats }
}

export async function ingestFile(pathOrUrl: string, options: IngestOptions = {}): Promise<IngestResult> {
  await ensureDir(STAGING_ROOT)

  let inputPath = pathOrUrl
  let sourceName = basename(pathOrUrl)

  if (isUrl(pathOrUrl)) {
    const url = new URL(pathOrUrl)
    sourceName = basename(url.pathname) || 'download'
  }

  const extension = extensionFromPath(sourceName)
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error(`Unsupported input type: ${extension}`)
  }

  let slug = slugifyTitle(options.title || sourceName) || `song_${Date.now()}`
  let stagingDir = join(STAGING_ROOT, slug)
  let sourceDir = join(stagingDir, 'source')
  let draftDir = join(stagingDir, 'drafts')
  let normalizedDir = join(stagingDir, 'normalized')

  await ensureDir(sourceDir)

  if (isUrl(pathOrUrl)) {
    inputPath = join(sourceDir, sourceName)
    await downloadToFile(pathOrUrl, inputPath)
  } else {
    inputPath = resolve(pathOrUrl)
    const copyName = sourceName || basename(inputPath)
    const targetPath = join(sourceDir, copyName)
    await copyFileSafe(inputPath, targetPath)
    inputPath = targetPath
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
    const previewPath = join(sourceDir, `preview${extension}`)
    if (!(await fileExists(previewPath))) {
      await copyFileSafe(inputPath, previewPath)
    }
  }

  const extraction = await chooseExtractor(inputPath)
  const extractedMeta = extraction.meta || {}
  let extractedLines = extraction.lines
  let headerTitle: string | undefined
  let headerKey: string | undefined
  let headerAuthors: string | undefined
  let headerPresentation: string | undefined
  if (extraction.extractor.startsWith('pdf')) {
    const header = extractPdfHeader(extractedLines)
    extractedLines = header.lines
    headerTitle = header.title
    headerKey = header.key
    headerAuthors = header.authors
  } else if (extraction.extractor === 'opensong') {
    headerTitle = extractedMeta.title
    headerKey = extractedMeta.key
    headerAuthors = extractedMeta.authors?.join(', ')
    headerPresentation = extractedMeta.presentation
  }
  const warnings = [...extraction.warnings]

  if (extraction.extractor === 'opensong' && extractedMeta.hasChords === false) {
    await rm(stagingDir, { recursive: true, force: true })
    return {
      skipped: true,
      reason: 'no_chords',
      title: headerTitle || slugifyTitle(sourceName).replace(/_/g, ' ') || 'Untitled'
    }
  }

  const inferredTitle = options.title || headerTitle || slugifyTitle(sourceName).replace(/_/g, ' ')
  const finalSlug = slugifyTitle(options.title || headerTitle || inferredTitle) || slug

  if (finalSlug !== slug) {
    const renamed = await renameToUnique(stagingDir, finalSlug)
    slug = renamed.slug
    stagingDir = renamed.path
    sourceDir = join(stagingDir, 'source')
  } else {
    slug = finalSlug
  }

  draftDir = join(stagingDir, 'drafts')
  normalizedDir = join(stagingDir, 'normalized')
  await ensureDir(draftDir)
  await ensureDir(normalizedDir)
  const draftResult = buildDraft(
    extractedLines,
    {
      ...options,
      title: options.title || headerTitle || inferredTitle,
      authors: options.authors || headerAuthors,
      key: options.key || headerKey,
      presentation: options.presentation || headerPresentation
    },
    warnings
  )

  const draftPath = join(draftDir, `${slug}_draft.chordpro`)
  await writeText(draftPath, draftResult.text)

  const normalized = normalizeChordPro(draftResult.text, {
    title: options.title || headerTitle || inferredTitle,
    key: options.key || headerKey,
    authors: options.authors || headerAuthors,
    tags: options.tags
  })
  const normalizedPath = join(normalizedDir, `${slug}.chordpro`)
  await writeText(normalizedPath, normalized)

  const reportStats = {
    ...draftResult.stats,
    ocrConfidenceAvg: extraction.stats.ocrConfidenceAvg
  }

  const report = scoreExtraction({
    stats: reportStats,
    warnings,
    extractor: extraction.extractor
  })

  const reportPath = join(stagingDir, 'report.json')
  await writeText(
    reportPath,
    JSON.stringify({ ...report, title: options.title || headerTitle || inferredTitle }, null, 2)
  )

  const reportHtml = renderReportHtml({ ...report, title: options.title || headerTitle || inferredTitle })
  await writeText(join(stagingDir, 'report.html'), reportHtml)

  const previewHtml = renderPreviewHtml(normalized)
  await writeText(join(stagingDir, 'preview.html'), previewHtml)

  return {
    stagingDir,
    report,
    title: options.title || headerTitle || inferredTitle
  }
}

export async function normalizeStaging(stagingDir: string): Promise<string> {
  const slug = basename(stagingDir)
  const draftPath = join(stagingDir, 'drafts', `${slug}_draft.chordpro`)
  const reportPath = join(stagingDir, 'report.json')

  const draft = await readText(draftPath)
  let title = ''
  if (await fileExists(reportPath)) {
    const report = JSON.parse(await readText(reportPath))
    if (report.title) title = report.title
  }

  const normalized = normalizeChordPro(draft, { title })
  await writeText(join(stagingDir, 'normalized', `${slug}.chordpro`), normalized)
  await writeText(join(stagingDir, 'preview.html'), renderPreviewHtml(normalized))
  return normalized
}

export async function approveStaging(stagingDir: string, toDir: string, runIndex: boolean) {
  const slug = basename(stagingDir)
  const normalizedPath = join(stagingDir, 'normalized', `${slug}.chordpro`)
  const targetPath = join(resolve(toDir), `${slug}.chordpro`)
  await copyFileSafe(normalizedPath, targetPath)

  if (runIndex) {
    const root = await findRepoRoot(process.cwd())
    if (!root) {
      console.log('Unable to find repo root with build-index script. Run: npm run build-index')
      return
    }
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    if (!pkg.scripts || (!pkg.scripts['build-index'] && !pkg.scripts['build:index'])) {
      console.log('build-index script not found. Run your index script manually.')
      return
    }
    await runNpmBuildIndex(root)
  }
}

export async function loadReport(stagingDir: string) {
  const reportPath = join(stagingDir, 'report.json')
  const raw = await readText(reportPath)
  return JSON.parse(raw)
}

export async function exportNormalized(fromDir: string, toDir: string): Promise<{
  copied: number
  skipped: number
}> {
  await ensureDir(toDir)
  const entries = await readdir(fromDir)
  let copied = 0
  let skipped = 0
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const full = join(fromDir, entry)
    const info = await stat(full)
    if (!info.isDirectory()) continue
    const normalizedPath = join(full, 'normalized', `${entry}.chordpro`)
    if (await fileExists(normalizedPath)) {
      const targetPath = join(toDir, `${entry}.chordpro`)
      await copyFileSafe(normalizedPath, targetPath)
      copied += 1
    } else {
      skipped += 1
    }
  }
  return { copied, skipped }
}

async function runNpmBuildIndex(root: string): Promise<void> {
  const { spawn } = await import('node:child_process')
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('npm', ['run', 'build-index'], { cwd: root, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error('build-index failed'))
    })
  })
}

async function findRepoRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir)
  for (let i = 0; i < 6; i += 1) {
    const pkgPath = join(current, 'package.json')
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
      if (pkg && pkg.scripts && (pkg.scripts['build-index'] || pkg.scripts['build:index'])) {
        return current
      }
    } catch {
      // ignore
    }
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  return null
}

export async function listSupportedFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder)
  const files: string[] = []
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const full = join(folder, entry)
    const info = await stat(full)
    if (!info.isFile()) continue
    if (info.size === 0) continue
    const ext = extensionFromPath(entry)
    if (ext === '' || ext === '.xml') {
      try {
        const raw = await readText(full)
        if (isOpenSongXml(raw)) {
          files.push(full)
        }
      } catch {
        // ignore unreadable files
      }
      continue
    }
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      files.push(full)
    }
  }
  return files
}
