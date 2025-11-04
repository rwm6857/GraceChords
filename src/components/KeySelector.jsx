import React from 'react'
import SelectUI from './ui/Select'
import { KEYS, keyRoot, stepsBetween, transposeSym } from '../utils/chordpro'

// Display names for the 12 pitch classes using flats
const KEYS_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']

function isMinorKey(k){
  return /(^|\b)[A-G][#b]?m($|\b)/i.test(String(k || ''))
}

function choosePrefAuto(root){
  // Prefer flats when current root is one of the flat-friendly classes
  const idx = KEYS.indexOf(keyRoot(root))
  return [1,3,6,8,10].includes(idx) ? 'flat' : 'sharp'
}

export default function KeySelector({
  baseKey = 'C',       // e.g., 'Am' or 'G'
  valueKey = 'C',      // current key (will be normalized to its root for value)
  onChange,            // (newFullKey: string) => void
  disabled = false,
  accidentalPref = 'auto', // 'auto' | 'sharp' | 'flat'
  variant = 'native',  // 'native' | 'ui' (wrap with styled Select)
  title,
  style,
  className,
}){
  const minor = isMinorKey(baseKey)
  const valueRoot = keyRoot(valueKey || baseKey)
  const pref = accidentalPref === 'auto' ? choosePrefAuto(valueRoot) : accidentalPref
  const labels = pref === 'flat' ? KEYS_FLAT : KEYS

  const options = KEYS.map((canonicalRoot, i) => ({
    value: canonicalRoot, // normalized sharp root for internal value
    label: minor ? `${labels[i]}m` : labels[i]
  }))

  const handleChange = (e) => {
    const root = e.target.value // canonical sharp root
    const steps = stepsBetween(baseKey, root)
    const full = transposeSym(baseKey, steps) // preserves minor/quality from baseKey
    if (onChange) onChange(full)
  }

  if (variant === 'ui'){
    return (
      <SelectUI value={valueRoot} onChange={handleChange} disabled={disabled} title={title} style={style} className={className}>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </SelectUI>
    )
  }

  return (
    <select value={valueRoot} onChange={handleChange} disabled={disabled} title={title} style={style} className={className}>
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  )
}

