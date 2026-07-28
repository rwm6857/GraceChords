#!/usr/bin/env node
//
// Generates the Swift mirror of `native.ts` for apps/studio (macOS).
//
// Why generate instead of sharing: Studio is a native SwiftUI target and
// deliberately not an npm workspace member, so it cannot import the TypeScript
// map the way apps/mobile does. The output is therefore *committed* — an Xcode
// build never needs node — and this script is what keeps it honest. `--check`
// fails when the committed files no longer match `native.ts`, so token drift is
// caught rather than discovered on screen.
//
// Usage:
//   node packages/tokens/generate-swift.mjs           # write
//   node packages/tokens/generate-swift.mjs --check    # verify, exit 1 if stale
//
// Emits:
//   apps/studio/…/Design/DesignTokens.generated.swift
//   apps/studio/…/Assets.xcassets/AccentColor.colorset/Contents.json
//
// Colors are resolved to numeric sRGB components here rather than parsed at
// runtime in Swift, so an unparseable token is a generator error instead of a
// silently wrong color in the app. Each token is emitted as all four macOS
// appearance variants (light/dark × normal/Increase-Contrast), built from
// native.ts's `*ContrastBoost` overlays; Theme.swift picks between them.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

// native.ts is imported directly, which relies on Node's built-in TypeScript
// type stripping (on by default from 22.18). Older versions throw
// ERR_UNKNOWN_FILE_EXTENSION, which does not hint at the cause.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    `This script imports packages/tokens/native.ts directly and needs Node >= 22.18 ` +
      `for TypeScript type stripping (running ${process.versions.node}).`,
  )
  process.exit(1)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const NATIVE_TS = path.join(here, 'native.ts')
const STUDIO_SOURCES = path.resolve(
  here,
  '../../apps/studio/GraceChords Studio/GraceChords Studio',
)
const SWIFT_OUT = path.join(STUDIO_SOURCES, 'Design', 'DesignTokens.generated.swift')
const ACCENT_OUT = path.join(
  STUDIO_SOURCES,
  'Assets.xcassets',
  'AccentColor.colorset',
  'Contents.json',
)

const REGEN_COMMAND = 'npm run tokens:swift'

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------

/** `#RRGGBB`, `#RRGGBBAA`, `rgb(r,g,b)` or `rgba(r,g,b,a)` → components in 0–1. */
function parseColor(value, label) {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value.trim())
  if (hex) {
    const [r, g, b] = hex[1].match(/../g).map((pair) => parseInt(pair, 16) / 255)
    const a = hex[2] === undefined ? 1 : parseInt(hex[2], 16) / 255
    return { r, g, b, a }
  }

  const rgba =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      value.trim(),
    )
  if (rgba) {
    return {
      r: Number(rgba[1]) / 255,
      g: Number(rgba[2]) / 255,
      b: Number(rgba[3]) / 255,
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    }
  }

  throw new Error(
    `Cannot parse color for "${label}": ${JSON.stringify(value)}. ` +
      'Supported forms are #RRGGBB, #RRGGBBAA, rgb(...) and rgba(...).',
  )
}

/** Trims to a Swift-safe literal that always reads as a floating-point value. */
function float(n) {
  if (Number.isInteger(n)) return `${n}.0`
  const trimmed = n.toFixed(6).replace(/0+$/, '')
  return trimmed.endsWith('.') ? `${trimmed}0` : trimmed
}

/** A number that may legitimately be a whole value (spacing, radii, sizes). */
function scalar(n) {
  return Number.isInteger(n) ? String(n) : String(n)
}

function rgbaLiteral(value, label) {
  const { r, g, b, a } = parseColor(value, label)
  return `GCRGBA(red: ${float(r)}, green: ${float(g)}, blue: ${float(b)}, alpha: ${float(a)})`
}

// ---------------------------------------------------------------------------
// Doc-comment extraction
// ---------------------------------------------------------------------------

/**
 * Maps identifier → doc text for every documented property in native.ts, so the
 * generated Swift carries the same documentation as the source. First occurrence
 * wins; a key with no doc simply gets no comment.
 *
 * The comment body is matched with `(?:(?!\*\/)[\s\S])*` rather than a lazy
 * `[\s\S]*?` so it can never span a `*␀/`. Without that, a doc block introducing
 * a `type`/`const` (which is not followed by `identifier:`) backtracks and
 * swallows every line up to the next documented property.
 */
function extractDocs(source) {
  const docs = new Map()
  const pattern =
    /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/[ \t]*\r?\n?[ \t]*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[?:]/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const [, body, key] = match
    if (docs.has(key)) continue
    const text = body
      .split('\n')
      .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) docs.set(key, text)
  }
  return docs
}

/**
 * Joins emitted members, inserting a blank line before any member that opens
 * with a doc comment or a nested group so declarations never sit flush against
 * the previous one's body.
 */
function joinMembers(members) {
  return members
    .map((member, index) => {
      if (index === 0) return member
      const opensWithDoc = /^\s*\/\/\//.test(member)
      const opensGroup = /^\s*enum /.test(member)
      return opensWithDoc || opensGroup ? `\n${member}` : member
    })
    .join('')
}

function docComment(docs, key, indent) {
  const text = docs.get(key)
  if (!text) return ''
  // Wrap to keep the generated file readable at a normal editor width.
  const width = 96 - indent.length
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.map((l) => `${indent}/// ${l}\n`).join('')
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

const FONT_WEIGHTS = {
  100: '.ultraLight',
  200: '.thin',
  300: '.light',
  400: '.regular',
  500: '.medium',
  600: '.semibold',
  700: '.bold',
  800: '.heavy',
  900: '.black',
}

/**
 * Parent keys whose numeric leaves are point dimensions (CGFloat). Everything
 * else numeric in `layout` is a count or a flex weight and stays Int. A new
 * nested group in native.ts's `layout` that needs CGFloat must be added here —
 * see the `assertLayoutRule` guard below.
 */
const LAYOUT_CGFLOAT_PARENTS = new Set(['maxWidth'])

function pascal(key) {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function emitColors(lightColors, darkColors, lightBoost, darkBoost, docs) {
  const lightHC = { ...lightColors, ...lightBoost }
  const darkHC = { ...darkColors, ...darkBoost }

  const lightKeys = Object.keys(lightColors)
  const darkKeys = Object.keys(darkColors)
  const missing = lightKeys.filter((k) => !darkKeys.includes(k))
  if (missing.length) {
    throw new Error(`darkColors is missing token(s): ${missing.join(', ')}`)
  }

  const colorKeys = lightKeys.filter((key) => typeof lightColors[key] === 'string')
  const gradientKeys = lightKeys.filter(
    (key) => lightColors[key] !== null && typeof lightColors[key] === 'object',
  )

  const colors = joinMembers(
    colorKeys.map((key) => {
      const indent = '    '
      return (
        docComment(docs, key, indent) +
        `${indent}static let ${key} = GCDynamicColor(\n` +
        `${indent}    light: ${rgbaLiteral(lightColors[key], `lightColors.${key}`)},\n` +
        `${indent}    dark: ${rgbaLiteral(darkColors[key], `darkColors.${key}`)},\n` +
        `${indent}    lightIncreasedContrast: ${rgbaLiteral(lightHC[key], `lightContrastBoost.${key}`)},\n` +
        `${indent}    darkIncreasedContrast: ${rgbaLiteral(darkHC[key], `darkContrastBoost.${key}`)}\n` +
        `${indent}).color\n`
      )
    }),
  )

  return { colors, gradientKeys, lightHC, darkHC }
}

function emitGradients(gradientKeys, lightColors, darkColors, docs) {
  return joinMembers(
    gradientKeys.map((key) => {
      const indent = '    '
      const stops = (palette, source) => {
        const { colors, locations } = palette[key]
        if (colors.length !== locations.length) {
          throw new Error(
            `${source}.${key} has ${colors.length} colors but ${locations.length} locations.`,
          )
        }
        return colors
          .map(
            (color, index) =>
              `${indent}            Gradient.Stop(\n` +
              `${indent}                color: ${rgbaLiteral(color, `${source}.${key}[${index}]`)}.color,\n` +
              `${indent}                location: ${float(locations[index])}\n` +
              `${indent}            ),`,
          )
          .join('\n')
      }

      return (
        docComment(docs, key, indent) +
        `${indent}static func ${key}Stops(for scheme: ColorScheme) -> [Gradient.Stop] {\n` +
        `${indent}    switch scheme {\n` +
        `${indent}    case .dark:\n` +
        `${indent}        return [\n` +
        `${stops(darkColors, 'darkColors')}\n` +
        `${indent}        ]\n` +
        `${indent}    default:\n` +
        `${indent}        return [\n` +
        `${stops(lightColors, 'lightColors')}\n` +
        `${indent}        ]\n` +
        `${indent}    }\n` +
        `${indent}}\n`
      )
    }),
  )
}

function emitScale(name, values, docs) {
  return joinMembers(
    Object.entries(values).map(([key, value]) => {
      const indent = '    '
      if (typeof value !== 'number') {
        throw new Error(`${name}.${key} is not a number: ${JSON.stringify(value)}`)
      }
      return docComment(docs, key, indent) + `${indent}static let ${key}: CGFloat = ${scalar(value)}\n`
    }),
  )
}

function emitTypography(typography, docs) {
  return joinMembers(
    Object.entries(typography).map(([role, spec]) => {
      const indent = '    '
      const weight = FONT_WEIGHTS[spec.fontWeight]
      if (!weight) {
        throw new Error(
          `typography.${role} has unmapped fontWeight ${JSON.stringify(spec.fontWeight)}. ` +
            `Add it to FONT_WEIGHTS.`,
        )
      }
      const tracking = spec.letterSpacing ?? 0
      return (
        docComment(docs, role, indent) +
        `${indent}static let ${role} = GCTextSpec(\n` +
        `${indent}    size: ${scalar(spec.fontSize)},\n` +
        `${indent}    weight: ${weight},\n` +
        `${indent}    tracking: ${scalar(tracking)}\n` +
        `${indent})\n`
      )
    }),
  )
}

function assertLayoutRule(key, value, parents) {
  if (typeof value !== 'number') return
  const isDimension = parents.some((parent) => LAYOUT_CGFLOAT_PARENTS.has(parent))
  if (!isDimension && !Number.isInteger(value)) {
    throw new Error(
      `layout.${[...parents, key].join('.')} is fractional (${value}) but is not under a ` +
        `known dimension group. Add its parent key to LAYOUT_CGFLOAT_PARENTS in ` +
        `packages/tokens/generate-swift.mjs so it is emitted as CGFloat.`,
    )
  }
}

function emitLayout(node, docs, depth = 1, parents = []) {
  const indent = '    '.repeat(depth)
  return joinMembers(
    Object.entries(node).map(([key, value]) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return (
          docComment(docs, key, indent) +
          `${indent}enum ${pascal(key)} {\n` +
          emitLayout(value, docs, depth + 1, [...parents, key]) +
          `${indent}}\n`
        )
      }
      assertLayoutRule(key, value, parents)
      const isDimension = parents.some((parent) => LAYOUT_CGFLOAT_PARENTS.has(parent))
      const type = isDimension ? 'CGFloat' : 'Int'
      return docComment(docs, key, indent) + `${indent}static let ${key}: ${type} = ${scalar(value)}\n`
    }),
  )
}

// ---------------------------------------------------------------------------
// Swift file
// ---------------------------------------------------------------------------

function buildSwift(tokens, docs) {
  const { lightColors, darkColors, lightContrastBoost, darkContrastBoost } = tokens
  const { spacing, radii, layout, typography } = tokens

  const { colors, gradientKeys } = emitColors(
    lightColors,
    darkColors,
    lightContrastBoost,
    darkContrastBoost,
    docs,
  )
  const gradients = emitGradients(gradientKeys, lightColors, darkColors, docs)

  return `//
//  DesignTokens.generated.swift
//  GraceChords Studio
//
//  GENERATED FILE — DO NOT EDIT.
//
//  Source of truth: packages/tokens/native.ts (the same map apps/mobile consumes,
//  so the Signal-blue palette cannot drift between the iOS app and Studio).
//  Regenerate with: ${REGEN_COMMAND}
//
//  Every color carries all four macOS appearance variants — light and dark, each
//  with an Increase-Contrast form built from native.ts's contrast-boost overlays.
//  The resolution happens in Theme.swift, which also holds the macOS type scale
//  (the ramp below is the canonical iOS one, in iOS points).
//

import SwiftUI

// MARK: - Colors

/// The palette, as dynamic colors that follow the system appearance.
enum GCColor {
${colors}}

// MARK: - Gradients

/// The sanctioned gradients. Locations differ per appearance, so these take an
/// explicit \`ColorScheme\` rather than resolving dynamically like colors do.
enum GCGradient {
${gradients}}

// MARK: - Spacing

/// 4-pt spacing scale.
enum GCSpacing {
${emitScale('spacing', spacing, docs)}}

// MARK: - Radii

/// Corner radii.
enum GCRadius {
${emitScale('radii', radii, docs)}}

// MARK: - Layout

/// Content-width caps and layout constants.
enum GCLayout {
${emitLayout(layout, docs)}}

// MARK: - Typography

/// The canonical type ramp, in the iOS points native.ts declares. \`GCTextSpec\`
/// scales these for macOS — see \`GCTypeScale\` in Theme.swift.
extension GCTextSpec {
${emitTypography(typography, docs)}}
`
}

// ---------------------------------------------------------------------------
// Asset catalog accent color
// ---------------------------------------------------------------------------

function buildAccentColorSet(lightColors, darkColors) {
  const component = (value, label) => {
    const { r, g, b, a } = parseColor(value, label)
    const byte = (n) => `0x${Math.round(n * 255).toString(16).toUpperCase().padStart(2, '0')}`
    return {
      'color-space': 'srgb',
      components: { alpha: a.toFixed(3), blue: byte(b), green: byte(g), red: byte(r) },
    }
  }

  return `${JSON.stringify(
    {
      colors: [
        { color: component(lightColors.accent, 'lightColors.accent'), idiom: 'universal' },
        {
          appearances: [{ appearance: 'luminosity', value: 'dark' }],
          color: component(darkColors.accent, 'darkColors.accent'),
          idiom: 'universal',
        },
      ],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  )}\n`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const check = process.argv.includes('--check')

const source = await readFile(NATIVE_TS, 'utf8')
const tokens = await import(pathToFileURL(NATIVE_TS).href)
const docs = extractDocs(source)

const outputs = [
  { file: SWIFT_OUT, contents: buildSwift(tokens, docs) },
  { file: ACCENT_OUT, contents: buildAccentColorSet(tokens.lightColors, tokens.darkColors) },
]

const rel = (file) => path.relative(path.resolve(here, '../..'), file)

if (check) {
  const stale = []
  for (const { file, contents } of outputs) {
    const existing = await readFile(file, 'utf8').catch(() => null)
    if (existing !== contents) stale.push(rel(file))
  }
  if (stale.length) {
    console.error(
      `Design tokens are stale — packages/tokens/native.ts has changed but its Swift\n` +
        `mirror has not been regenerated:\n` +
        stale.map((file) => `  ${file}`).join('\n') +
        `\n\nRun \`${REGEN_COMMAND}\` and commit the result.`,
    )
    process.exit(1)
  }
  console.log(`Design tokens are up to date (${outputs.length} files checked).`)
} else {
  for (const { file, contents } of outputs) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, contents)
    console.log(`wrote ${rel(file)}`)
  }
}
