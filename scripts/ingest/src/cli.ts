#!/usr/bin/env node
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { spawn } from 'node:child_process'
import { rm, mkdir, writeFile, rename, readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { ingestFile, normalizeStaging, approveStaging, loadReport, listSupportedFiles } from './ingest.js'
import { compareAgainstLibrary } from './compare.js'
import { renderCompareReportHtml } from './utils/compareReportHtml.js'
import { renderBatchReportHtml } from './utils/batchReportHtml.js'
import { buildCompareSummary, buildCompareMarkdown } from './utils/compareSummary.js'
import { fileExists } from './utils/fs.js'

const distDir = fileURLToPath(new URL('.', import.meta.url))
const packageRoot = resolve(distDir, '..')
const defaultInbox = resolve(packageRoot, '_ingest_inbox')
const stagingRoot = resolve(packageRoot, '_ingest_staging')

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  orange: '\x1b[38;5;208m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  bold: '\x1b[1m'
}

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`
}

function scoreColor(score: number): keyof typeof colors {
  if (score >= 85) return 'green'
  if (score >= 70) return 'yellow'
  if (score >= 50) return 'orange'
  return 'red'
}

function compareScoreColor(score: number): keyof typeof colors {
  if (score >= 85) return 'green'
  if (score >= 70) return 'yellow'
  if (score >= 50) return 'orange'
  return 'red'
}

function formatCompareSummary(input: {
  title: string
  slug: string
  matchScore?: number
  status: string
}): string {
  const badge = typeof input.matchScore === 'number' ? `${input.matchScore}% match` : input.status
  const color =
    typeof input.matchScore === 'number'
      ? compareScoreColor(input.matchScore)
      : input.status === 'skipped'
      ? 'dim'
      : 'orange'
  return `${colorize('•', 'dim')} ${colorize(input.title, 'bold')} ${colorize('—', 'dim')} ${colorize(badge, color)} ${colorize(`(${input.slug})`, 'dim')}`
}

function formatSongSummary(input: {
  title: string
  score: number
  status: string
  stagingDir: string
  warningCount: number
}): string {
  const scoreText = colorize(`${input.score}`, scoreColor(input.score))
  const statusText = colorize(input.status, scoreColor(input.score))
  const warningText = input.warningCount > 0 ? ` • ${input.warningCount} warning${input.warningCount > 1 ? 's' : ''}` : ''
  return `${colorize('•', 'dim')} ${colorize(input.title, 'bold')} ${colorize('—', 'dim')} ${scoreText} ${statusText}${warningText}\n  ${colorize('staged:', 'dim')} ${input.stagingDir}`
}

async function promptYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

function openFile(path: string): void {
  const platform = process.platform
  if (platform === 'darwin') {
    spawn('open', [path], { stdio: 'ignore', detached: true })
  } else if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', path], { stdio: 'ignore', detached: true })
  } else {
    spawn('xdg-open', [path], { stdio: 'ignore', detached: true })
  }
}

const program = new Command()

program
  .name('gc-ingest')
  .description('GraceChords ingestion CLI')
  .version('0.1.0')

program
  .command('ingest')
  .argument('<pathOrUrl>', 'input file path or URL')
  .option('--title <title>', 'song title override')
  .option('--authors <authors>', 'artist/author')
  .option('--key <key>', 'song key')
  .option('--tags <tags>', 'comma-separated tags')
  .action(async (pathOrUrl, options) => {
    const result = await ingestFile(pathOrUrl, options)
    const summary = formatSongSummary({
      title: result.title,
      score: result.report.score,
      status: result.report.status,
      stagingDir: result.stagingDir,
      warningCount: result.report.warnings.length
    })
    console.log(summary)
    if (result.report.warnings.length > 0) {
      console.log(colorize('Warnings:', 'dim'))
      result.report.warnings.forEach((warning) => console.log(`- ${warning}`))
    }

    const reportPath = join(result.stagingDir, 'report.html')
    const open = await promptYesNo('Open report HTML? [y/N] ')
    if (open) openFile(reportPath)
  })

program
  .command('batch')
  .argument('<folder>', 'folder of inputs')
  .option('--concurrency <n>', 'parallelism', '2')
  .action(async (folder, options) => {
    const files = await listSupportedFiles(folder)
    const concurrency = Number(options.concurrency) || 2
    let index = 0
    const summaries: Array<{
      title: string
      score: number
      status: string
      warnings: string[]
      stagingDir: string
      report: any
    }> = []

    const worker = async () => {
      while (index < files.length) {
        const file = files[index]
        index += 1
        try {
          const result = await ingestFile(file, {})
          summaries.push({
            title: result.title,
            score: result.report.score,
            status: result.report.status,
            warnings: result.report.warnings,
            stagingDir: result.stagingDir,
            report: result.report
          })
          console.log(
            formatSongSummary({
              title: result.title,
              score: result.report.score,
              status: result.report.status,
              stagingDir: result.stagingDir,
              warningCount: result.report.warnings.length
            })
          )
        } catch (error) {
          console.error(`Failed ${file}: ${(error as Error).message}`)
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()))

    if (summaries.length > 0) {
      const warningCounts = new Map<string, number>()
      summaries.forEach((summary) => {
        summary.warnings.forEach((warning) => {
          warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1)
        })
      })

      if (warningCounts.size > 0) {
        console.log(`\n${colorize('Warnings summary:', 'dim')}`)
        for (const [warning, count] of warningCounts.entries()) {
          console.log(`- ${warning} (${count})`)
        }
      }

      const reportPath = join(stagingRoot, 'batch_report.html')
      await mkdir(stagingRoot, { recursive: true })
      const reportHtml = renderBatchReportHtml(
        summaries.map((summary) => ({
          title: summary.title,
          stagingDir: summary.stagingDir,
          report: summary.report
        }))
      )
      await writeFile(reportPath, reportHtml, 'utf8')

      const open = await promptYesNo('Open batch report HTML? [y/N] ')
      if (open) openFile(reportPath)
    }
  })

program
  .command('normalize')
  .argument('<stagingSongDir>', 'staging directory path')
  .action(async (stagingSongDir) => {
    await normalizeStaging(stagingSongDir)
    console.log('Normalized output updated.')
  })

program
  .command('approve')
  .argument('<stagingSongDir>', 'staging directory path')
  .requiredOption('--to <dir>', 'destination songs folder')
  .option('--run-index', 'run build-index after copy')
  .action(async (stagingSongDir, options) => {
    await approveStaging(stagingSongDir, options.to, Boolean(options.runIndex))
    console.log('Approved and copied.')
  })

program
  .command('report')
  .argument('<stagingSongDir>', 'staging directory path')
  .action(async (stagingSongDir) => {
    const report = await loadReport(stagingSongDir)
    console.log(JSON.stringify(report, null, 2))
  })

program
  .command('compare')
  .option('--pdf-dir <dir>', 'source PDFs folder (default inbox)')
  .option('--songs-dir <dir>', 'songs folder (default public/songs)')
  .option('--do-ingest', 're-ingest sources before comparing')
  .option('--strict-chords', 'require exact chord matches')
  .option('--chords', 'compare chord placement only')
  .option('--lyrics', 'compare lyrics only')
  .option('--sections', 'compare section headers only')
  .option('--export-json', 'write compare_report.json')
  .option('--export-md', 'write compare_summary.md')
  .action(async (options) => {
    const inputsDir = options.pdfDir || defaultInbox
    const songsDir = options.songsDir || resolve(packageRoot, '..', '..', 'public', 'songs')
    const results = await compareAgainstLibrary({
      inputsDir,
      songsDir,
      stagingRoot,
      doIngest: Boolean(options.doIngest),
      strictChords: Boolean(options.strictChords),
      compareChords: Boolean(options.chords),
      compareLyrics: Boolean(options.lyrics),
      compareSections: Boolean(options.sections)
    })

    results.forEach((result) => {
      console.log(
        formatCompareSummary({
          title: result.title,
          slug: result.slug,
          matchScore: result.matchScore,
          status: result.status
        })
      )
    })

    const reportPath = join(stagingRoot, 'compare_report.html')
    const jsonPath = join(stagingRoot, 'compare_report.json')
    const oldJsonPath = join(stagingRoot, 'compare_report.old.json')
    await mkdir(stagingRoot, { recursive: true })

    const previousScores = new Map<string, number>()
    if (await fileExists(jsonPath)) {
      await rm(oldJsonPath, { force: true })
      await rename(jsonPath, oldJsonPath)
      const oldRaw = await readFile(oldJsonPath, 'utf8')
      const oldReport = JSON.parse(oldRaw)
      if (oldReport?.songs) {
        oldReport.songs.forEach((song: any) => {
          if (typeof song.matchScore === 'number' && song.slug) {
            previousScores.set(song.slug, song.matchScore)
          }
        })
      }
    }

    let previousAvgScore: number | null = null
    if (previousScores.size > 0) {
      const values = Array.from(previousScores.values())
      previousAvgScore = values.reduce((a, b) => a + b, 0) / values.length
    }

    const reportHtml = renderCompareReportHtml(
      results,
      inputsDir,
      songsDir,
      {
        strictChords: Boolean(options.strictChords),
        compareChords: Boolean(options.chords),
        compareLyrics: Boolean(options.lyrics),
        compareSections: Boolean(options.sections),
        previousScores,
        previousAvgScore
      }
    )

    await writeFile(reportPath, reportHtml, 'utf8')

    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          config: {
            inputsDir,
            songsDir,
            strictChords: Boolean(options.strictChords),
            scope: [
              options.chords ? 'chords' : '',
              options.lyrics ? 'lyrics' : '',
              options.sections ? 'sections' : ''
            ].filter(Boolean)
          },
          summary: buildCompareSummary(results),
          songs: results
        },
        null,
        2
      ),
      'utf8'
    )

    if (options.exportJson) {
      console.log(colorize(`Wrote ${jsonPath}`, 'dim'))
    }

    if (options.exportMd) {
      const mdPath = join(stagingRoot, 'compare_summary.md')
      await writeFile(mdPath, buildCompareMarkdown(results, inputsDir, songsDir, options), 'utf8')
      console.log(colorize(`Wrote ${mdPath}`, 'dim'))
    }

    const open = await promptYesNo('Open compare report HTML? [y/N] ')
    if (open) openFile(reportPath)
  })

program.option('--cleanup', 'clear inbox and staging output')

async function clearDirectory(path: string): Promise<void> {
  try {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(path)
    await Promise.all(
      entries
        .filter((entry) => entry !== '.gitkeep')
        .map((entry) => rm(join(path, entry), { recursive: true, force: true }))
    )
  } catch {
    // ignore
  }
}

async function runCleanup(): Promise<void> {
  const ok = await promptYesNo('Clear inbox and staging directories? [y/N] ')
  if (!ok) return
  await clearDirectory(defaultInbox)
  await clearDirectory(stagingRoot)
  await mkdir(defaultInbox, { recursive: true })
  await mkdir(stagingRoot, { recursive: true })
  console.log(colorize('Cleaned inbox and staging.', 'dim'))
}

async function main() {
  const shouldCleanup = process.argv.includes('--cleanup')
  if (shouldCleanup) {
    const index = process.argv.indexOf('--cleanup')
    if (index !== -1) process.argv.splice(index, 1)
    await runCleanup()
    return
  }

  if (process.argv.length <= 2) {
    process.argv.push('batch', defaultInbox)
  }

  await program.parseAsync(process.argv)
}

main()
