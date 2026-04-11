import React, { useState } from 'react'
import SegmentedControl from '../../ui/layout-kit/SegmentedControl'
import { CHROMATIC_KEYS } from '../../../utils/chordpro/diatonicChords'

const MAJOR_KEYS = CHROMATIC_KEYS.slice(0, 12)
const MINOR_KEYS = CHROMATIC_KEYS.slice(12)

const MODE_OPTIONS = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
]

export default function KeyGrid({ value, onChange }) {
  const [mode, setMode] = useState(() => (value && value.endsWith('m') ? 'minor' : 'major'))

  const keys = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS

  function handleModeChange(newMode) {
    setMode(newMode)
    const isMajor = value && !value.endsWith('m')
    const isMinor = value && value.endsWith('m')
    if (newMode === 'major' && isMinor) onChange('')
    if (newMode === 'minor' && isMajor) onChange('')
  }

  return (
    <div className="gc-key-grid">
      <SegmentedControl
        className="gc-key-grid__mode"
        ariaLabel="Key mode"
        value={mode}
        onChange={handleModeChange}
        options={MODE_OPTIONS}
      />
      <div className="gc-key-grid__keys" role="radiogroup" aria-label="Select key">
        {keys.map(key => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            className={`gc-key-grid__key${value === key ? ' is-selected' : ''}`}
            onClick={() => onChange(key)}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}
