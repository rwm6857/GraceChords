#!/usr/bin/env node
// Run Google PageSpeed Insights (v5) against production for mobile + desktop
// and print a compact summary. Raw JSON reports go to ./pagespeed-reports/.
//
//   npm run pagespeed [-- url ...]   (reads PAGESPEED_API_KEY from the repo-root .env)
//
// The key is optional, but the anonymous quota is shared and is usually
// exhausted — create a key under Google Cloud → APIs & Services → Credentials
// with the "PageSpeed Insights API" enabled.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = process.env.PAGESPEED_ORIGIN || 'https://gracechords.com'
const DEFAULT_PATHS = ['/', '/songs', '/songs/10000_reasons/', '/reading', '/resources']
const STRATEGIES = ['mobile', 'desktop']
const API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pagespeed-reports')

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : DEFAULT_PATHS.map((p) => new URL(p, ORIGIN).href)

const METRICS = [
  ['first-contentful-paint', 'FCP'],
  ['largest-contentful-paint', 'LCP'],
  ['total-blocking-time', 'TBT'],
  ['cumulative-layout-shift', 'CLS'],
  ['speed-index', 'SI'],
]

async function run(url, strategy) {
  const qs = new URLSearchParams({ url, strategy })
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) qs.append('category', c)
  if (process.env.PAGESPEED_API_KEY) qs.set('key', process.env.PAGESPEED_API_KEY)
  const res = await fetch(`${API}?${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
  return json
}

function summarize(json) {
  const lh = json.lighthouseResult
  const score = (k) => Math.round((lh.categories[k]?.score ?? 0) * 100)
  const metrics = Object.fromEntries(METRICS.map(([id, label]) => [label, lh.audits[id]?.displayValue]))
  const opportunities = Object.values(lh.audits)
    .filter((a) => a.details?.type === 'opportunity' && (a.details.overallSavingsMs > 0 || a.details.overallSavingsBytes > 0))
    .sort((a, b) => (b.details.overallSavingsMs || 0) - (a.details.overallSavingsMs || 0))
    .map((a) => `${a.title} (${Math.round(a.details.overallSavingsMs || 0)} ms, ${Math.round((a.details.overallSavingsBytes || 0) / 1024)} KiB)`)
  const field = json.loadingExperience?.overall_category
  return {
    scores: { perf: score('performance'), a11y: score('accessibility'), bp: score('best-practices'), seo: score('seo') },
    metrics,
    field: field || 'n/a',
    opportunities,
  }
}

await fs.mkdir(OUT_DIR, { recursive: true })
let failed = false
for (const url of urls) {
  for (const strategy of STRATEGIES) {
    try {
      const json = await run(url, strategy)
      const slug = new URL(url).pathname.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'
      await fs.writeFile(path.join(OUT_DIR, `${slug}.${strategy}.json`), JSON.stringify(json))
      const s = summarize(json)
      console.log(`\n${url} [${strategy}]`)
      console.log(`  scores  perf ${s.scores.perf} · a11y ${s.scores.a11y} · bp ${s.scores.bp} · seo ${s.scores.seo} · field ${s.field}`)
      console.log(`  metrics ${Object.entries(s.metrics).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
      for (const o of s.opportunities) console.log(`  - ${o}`)
    } catch (err) {
      failed = true
      console.error(`\n${url} [${strategy}] failed: ${err.message}`)
    }
  }
}
process.exitCode = failed ? 1 : 0
