import { parseChordProOrLegacy } from './parser'
import { serializeChordPro } from './serialize'
import type { SongDoc } from './types'

export type MetaExtras = {
  country?: string
  tags?: string[] | string
  youtube?: string
  mp3?: string
  pptx?: string
}

function slugifyUnderscore(s: string){
  return (s || '').toLowerCase().replace(/[^\w]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'')
}

function stripDecorations(title: string){
  return title
    .replace(/\((israeli|iranian|hindi|arabic|.*?\blanguage\b)\)/ig,'')
    .replace(/\bkey\s+of\s+[A-G][#b]?m?\b/ig,'')
    .replace(/\s{2,}/g,' ')
    .trim()
}

export function convertToCanonicalChordPro(raw: string, extras?: Partial<MetaExtras>){
  const doc: SongDoc = parseChordProOrLegacy(raw)
  const tags = Array.isArray(extras?.tags) ? extras?.tags.join(', ') : (extras?.tags || '')
  doc.meta = {
    title: stripDecorations(doc.meta?.title || ''),
    key: (doc.meta?.key || '').trim(),
    capo: doc.meta?.capo,
    meta: {
      ...(doc.meta?.meta || {}),
      ...(extras?.country ? { country: extras.country } : {}),
      ...(tags ? { tags } : {}),
      ...(extras?.youtube ? { youtube: extras.youtube } : {}),
      ...(extras?.mp3 ? { mp3: extras.mp3 } : {}),
      ...(extras?.pptx ? { pptx: extras.pptx } : {}),
    }
  }

  const text = serializeChordPro(doc, { useDirectives: true })
  const docTitle = stripDecorations(doc.meta.title || 'Untitled')
  return { text, docTitle, docKey: doc.meta.key }
}

export function suggestCanonicalFilename(title: string){
  return `${slugifyUnderscore(stripDecorations(title || 'untitled'))}.chordpro`
}
