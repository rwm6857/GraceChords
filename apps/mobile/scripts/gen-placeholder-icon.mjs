// PLACEHOLDER APP ICON GENERATOR — swap before public release.
//
// Produces a temporary 1024x1024 app icon so EAS/TestFlight builds pass their
// icon check (App Store Connect rejects builds with no icon, and rejects any
// icon with an alpha channel). This is intentionally a flat brand-color square
// with a white "GC" monogram — NOT the real brand icon. Replace
// apps/mobile/assets/icon.png with the final artwork (still 1024x1024, no alpha)
// and this script can be deleted.
//
//   run: node scripts/gen-placeholder-icon.mjs   (from apps/mobile/)
//
// Colors come from packages/tokens/native.ts: light.accent (Signal blue) as the
// background, light.onAccent (white) as the monogram. Flat color only — no
// gradient, no SF Symbol (icons must be embedded raster, not a symbol ref).

import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ACCENT = '#1F84C9' // packages/tokens/native.ts -> light.accent (Signal blue)
const ON_ACCENT = '#FFFFFF' // packages/tokens/native.ts -> light.onAccent
const SIZE = 1024

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../assets/icon.png')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${ACCENT}"/>
  <text x="50%" y="50%" fill="${ON_ACCENT}"
        font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif"
        font-size="520" font-weight="bold"
        text-anchor="middle" dominant-baseline="central"
        letter-spacing="-8">GC</text>
</svg>`

await sharp(Buffer.from(svg))
  // flatten drops the alpha channel by compositing onto a solid background —
  // required because TestFlight rejects icons with transparency.
  .flatten({ background: ACCENT })
  .png()
  .toFile(out)

const meta = await sharp(out).metadata()
console.log(`wrote ${out} (${meta.width}x${meta.height}, channels=${meta.channels}, hasAlpha=${meta.hasAlpha})`)
