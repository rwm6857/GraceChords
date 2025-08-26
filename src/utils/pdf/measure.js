// src/utils/pdf/measure.js
import { resolveChordCollisions } from '../chords.js'

// Create a jsPDF text measurer bound to a font family/style
export function makeMeasure(doc, family, style = 'normal') {
  return (pt) => (text) => {
    doc.setFont(family, style)
    doc.setFontSize(pt)
    return doc.getTextWidth(text || '')
  }
}

export { resolveChordCollisions }

