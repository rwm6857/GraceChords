// src/utils/pdf/measure.js

// Create a jsPDF text measurer bound to a font family/style
export function makeMeasure(doc, family, style = 'normal') {
  return (pt) => (text) => {
    doc.setFont(family, style)
    doc.setFontSize(pt)
    return doc.getTextWidth(text || '')
  }
}

// Resolve chord collisions by nudging left/right up to maxNudge pt
export function resolveChordCollisions(chords, maxNudge = 3) {
  if (!Array.isArray(chords) || chords.length < 2) return chords
  chords.sort((a, b) => a.x - b.x)
  let changed = true
  let iter = 0
  while (changed && iter < 10) {
    changed = false
    iter++
    for (let i = 1; i < chords.length; i++) {
      const prev = chords[i - 1]
      const cur = chords[i]
      if (prev.x + prev.w > cur.x) {
        const overlap = prev.x + prev.w - cur.x
        const shift = Math.min(maxNudge, Math.ceil(overlap / 2))
        prev.x -= shift
        cur.x += shift
        changed = true
      }
    }
  }
  chords.sort((a, b) => a.x - b.x)
  return chords
}

