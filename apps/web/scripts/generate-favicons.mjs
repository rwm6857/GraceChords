#!/usr/bin/env node
// Regenerates the Signal Blue favicon / PWA icon set from the brand master SVG.
//
//   node apps/web/scripts/generate-favicons.mjs
//
// Output: apps/web/public/icons/v2/ — the folder is PATH-VERSIONED. To bust caches on a
// future refresh, bump the folder (v2 -> v3) here and in the index.html / site.webmanifest
// references; path versioning is the only scheme that reliably busts across all browsers
// (Safari ignores ?v= query strings on favicon.ico) and query-stripping CDNs.
//
// Uses sharp (already a devDependency) to rasterize the SVG; png-to-ico assembles the
// multi-image .ico that sharp cannot write.

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')
const repoRoot = resolve(webRoot, '..', '..')

const MASTER = resolve(repoRoot, 'NEW ASSETS', 'gc-light.svg')
const OUT = resolve(webRoot, 'public', 'icons', 'v2')
const BG = '#F5F7F9' // Signal Blue light page background — apple-touch/maskable need a solid field

mkdirSync(OUT, { recursive: true })
const svg = readFileSync(MASTER)

// Vector favicon — crisp at any size.
writeFileSync(resolve(OUT, 'favicon.svg'), svg)

// Flat raster set on a solid light field (no transparency).
const RASTERS = [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
]
for (const [name, size] of RASTERS) {
  await sharp(svg)
    .resize(size, size, { fit: 'contain', background: BG })
    .flatten({ background: BG })
    .png()
    .toFile(resolve(OUT, name))
}

// Maskable icon: brand mark inset to the ~80% safe zone on a solid field so Android's
// adaptive-icon crop never clips it.
const S = 512
const inner = Math.round(S * 0.8)
const mark = await sharp(svg)
  .resize(inner, inner, { fit: 'contain', background: BG })
  .flatten({ background: BG })
  .png()
  .toBuffer()
await sharp({ create: { width: S, height: S, channels: 3, background: BG } })
  .composite([{ input: mark, gravity: 'center' }])
  .png()
  .toFile(resolve(OUT, 'android-chrome-maskable-512x512.png'))

// Legacy .ico (16 + 32).
const ico = await pngToIco([
  resolve(OUT, 'favicon-16x16.png'),
  resolve(OUT, 'favicon-32x32.png'),
])
writeFileSync(resolve(OUT, 'favicon.ico'), ico)

console.log('Favicons written to', OUT)
