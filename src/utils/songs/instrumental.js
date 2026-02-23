import { transposeSymPrefer } from '../chordpro'

function normalizeSpec(spec){
  const chords = Array.isArray(spec?.chords) ? spec.chords.map(ch => String(ch || '').trim()).filter(Boolean) : []
  const repeat = typeof spec?.repeat === 'number' && spec.repeat > 1 ? Math.floor(spec.repeat) : undefined
  return { chords, repeat }
}

export function transposeInstrumental(spec, steps = 0, preferFlat = false){
  const { chords, repeat } = normalizeSpec(spec)
  const mapped = steps
    ? chords.map(sym => transposeSymPrefer(sym, steps, preferFlat))
    : chords.slice()
  return { chords: mapped, repeat }
}

function splitRows(chords, split){
  if (!split || chords.length <= 3) return [chords]
  const half = Math.ceil(chords.length / 2)
  const first = chords.slice(0, half)
  const second = chords.slice(half)
  if (!second.length) return [first]
  return [first, second]
}

export function formatInstrumental(spec, { split = false } = {}){
  const { chords, repeat } = normalizeSpec(spec)
  if (!chords.length){
    return repeat && repeat > 1 ? [`x${repeat}`] : []
  }
  const rows = splitRows(chords, split)
  return rows.map((row, idx) => {
    if (idx === rows.length - 1 && repeat && repeat > 1 && row.length){
      const clone = row.slice()
      clone[clone.length - 1] = `${clone[clone.length - 1]} x${repeat}`
      return clone.join('  //  ')
    }
    return row.join('  //  ')
  })
}

export function splitInstrumental(spec, { split = false } = {}){
  const { chords } = normalizeSpec(spec)
  if (!chords.length) return []
  return splitRows(chords, split)
}

export function formatInstrumentalTokens(spec, { split = false } = {}){
  const { chords, repeat } = normalizeSpec(spec)
  if (!chords.length){
    return []
  }
  const rows = splitRows(chords, split)
  return rows.map((row, idx) => {
    return row.map((ch, i) => {
      const isLastChord = idx === rows.length - 1 && i === row.length - 1
      return {
        chord: ch,
        suffix: isLastChord && repeat && repeat > 1 ? `x${repeat}` : ''
      }
    })
  })
}
