import React from 'react'

const SECTIONS = [
  { label: 'Verse',       directive: 'verse' },
  { label: 'Chorus',      directive: 'chorus' },
  { label: 'Bridge',      directive: 'bridge' },
  { label: 'Pre-Chorus',  directive: 'pre_chorus' },
  { label: 'Intro',       directive: 'intro' },
  { label: 'Outro',       directive: 'outro' },
  { label: 'Tag',         directive: 'tag' },
  { label: 'Interlude',   directive: 'interlude' },
]

export default function QuickSectionsBar({ onWrap }) {
  return (
    <div className="gc-quick-sections">
      {SECTIONS.map(({ label, directive }) => (
        <button
          key={directive}
          className="gc-quick-sections__btn"
          onClick={() => onWrap && onWrap({ directive, label })}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
