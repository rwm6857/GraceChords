import { getChordproCommentBlock, isDisclaimerEnabled } from '../../config/disclaimer'

const MARKER = '# --- DISCLAIMER (GraceChords) ---'

export function hasDisclaimerCommentBlock(text: string): boolean {
  return String(text || '').split(/\r?\n/).some(line => line.trim() === MARKER)
}

export function appendDisclaimerIfMissing(text: string): string {
  if (!isDisclaimerEnabled()) return text
  const safe = String(text || '')
  if (hasDisclaimerCommentBlock(safe)) return safe
  const trimmed = safe.replace(/[\s\n]*$/, '')
  return trimmed + '\n\n' + getChordproCommentBlock()
}

export default { hasDisclaimerCommentBlock, appendDisclaimerIfMissing }

