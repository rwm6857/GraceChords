export function isIncompleteSong(song){
  const v = song?.incomplete
  if (typeof v === 'boolean') return v
  if (v === undefined || v === null) return false
  const s = String(v).trim().toLowerCase()
  if (!s) return false
  return ['1','true','yes','y','on'].includes(s)
}
