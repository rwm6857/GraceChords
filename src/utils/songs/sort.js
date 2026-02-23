export function normalizeTitleForSort(title = ''){
  const t = String(title || '').trim()
  const t2 = t.replace(/^[^A-Za-z0-9]+/, '') || t
  return t2
}

export function compareSongsByTitle(a, b){
  const aa = normalizeTitleForSort(a?.title || '')
  const bb = normalizeTitleForSort(b?.title || '')
  const aNum = /^[0-9]/.test(aa)
  const bNum = /^[0-9]/.test(bb)
  if (aNum !== bNum) return aNum ? -1 : 1
  return aa.localeCompare(bb, undefined, { sensitivity: 'base' })
}

