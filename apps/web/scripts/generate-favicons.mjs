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

const RADIUS_RATIO = 0.2 // rounded-square corner radius as a fraction of icon size

// White rounded-rect used as a dest-in mask to clip an icon's corners transparent.
const roundedMask = (size) => {
  const r = Math.round(size * RADIUS_RATIO)
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  )
}

// Render the master onto a solid light field at `size`, optionally clipping the corners
// to a rounded square (transparent corners).
async function render(size, { rounded }) {
  const flat = await sharp(svg)
    .resize(size, size, { fit: 'contain', background: BG })
    .flatten({ background: BG })
    .png()
    .toBuffer()
  if (!rounded) return flat
  return sharp(flat).composite([{ input: roundedMask(size), blend: 'dest-in' }]).png().toBuffer()
}

// Vector favicon — the master clipped to a rounded square (browsers prefer the SVG in the tab).
const svgB64 = svg.toString('base64')
const svgR = Math.round(512 * RADIUS_RATIO)
writeFileSync(
  resolve(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512">` +
    `<defs><clipPath id="gc-round"><rect width="512" height="512" rx="${svgR}" ry="${svgR}"/></clipPath></defs>` +
    `<image width="512" height="512" clip-path="url(#gc-round)" href="data:image/svg+xml;base64,${svgB64}" xlink:href="data:image/svg+xml;base64,${svgB64}"/>` +
    `</svg>\n`
)

// Rounded raster set (transparent corners). apple-touch stays square: iOS rounds it
// itself and renders alpha corners black on older versions.
const ROUNDED = [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
]
for (const [name, size] of ROUNDED) {
  writeFileSync(resolve(OUT, name), await render(size, { rounded: true }))
}
writeFileSync(resolve(OUT, 'apple-touch-icon.png'), await render(180, { rounded: false }))

// Maskable icon: FULL-BLEED square (never rounded) — Android applies its own mask. Brand
// mark inset to the ~80% safe zone so the adaptive-icon crop never clips it.
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

// Legacy .ico (16 + 32) from the rounded PNGs.
const ico = await pngToIco([
  resolve(OUT, 'favicon-16x16.png'),
  resolve(OUT, 'favicon-32x32.png'),
])
writeFileSync(resolve(OUT, 'favicon.ico'), ico)

console.log('Favicons written to', OUT)
