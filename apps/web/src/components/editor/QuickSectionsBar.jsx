import React from 'react'
import { SECTION_PRESETS } from '@gracechords/core'

// SECTION_PRESETS maps each UI label to a parser-supported directive (Pre-Chorus
// and Interlude become named choruses), so nothing the bar emits is silently
// dropped by the parser.
export default function QuickSectionsBar({ onWrap }) {
  return (
    <div className="gc-quick-sections">
      {SECTION_PRESETS.map(({ label, directive, sectionLabel }) => (
        <button
          key={label}
          className="gc-quick-sections__btn"
          onClick={() => onWrap && onWrap({ directive, label: sectionLabel })}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
