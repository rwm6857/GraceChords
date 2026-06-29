import React, { useState } from 'react'
import { getDiatonicChords } from '../../../utils/chordpro/diatonicChords'
import MobileActionSheet from '../../ui/mobile/MobileActionSheet'

const PRIMARY_SECTIONS = [
  { label: 'V',   directive: 'verse',      title: 'Verse' },
  { label: 'C',   directive: 'chorus',     title: 'Chorus' },
  { label: 'B',   directive: 'bridge',     title: 'Bridge' },
  { label: 'Pre', directive: 'pre_chorus', title: 'Pre-Chorus' },
  { label: 'Out', directive: 'outro',      title: 'Outro' },
]

const MORE_SECTIONS = [
  { label: 'Intro',     directive: 'intro',     title: 'Intro' },
  { label: 'Tag',       directive: 'tag',        title: 'Tag' },
  { label: 'Interlude', directive: 'interlude',  title: 'Interlude' },
]

export default function KeyboardAccessoryBar({ currentKey, onInsert, onWrap, onGuideOpen, keyboardHeight = 0 }) {
  const chords = getDiatonicChords(currentKey)
  const [moreOpen, setMoreOpen] = useState(false)

  const barStyle = keyboardHeight > 0 ? { bottom: keyboardHeight } : undefined

  return (
    <>
      <div className="gc-kbd-accessory" style={barStyle}>
        {/* Sections row */}
        <div className="gc-kbd-accessory__row gc-kbd-accessory__row--sections">
          {PRIMARY_SECTIONS.map(s => (
            <button
              key={s.directive}
              type="button"
              className="gc-kbd-accessory__btn gc-kbd-accessory__btn--section"
              onClick={() => onWrap({ directive: s.directive, label: s.title })}
              title={s.title}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            className="gc-kbd-accessory__btn gc-kbd-accessory__btn--more"
            onClick={() => setMoreOpen(true)}
            title="More sections"
          >
            ···
          </button>
        </div>

        {/* Chords row */}
        <div className="gc-kbd-accessory__row gc-kbd-accessory__row--chords">
          {chords ? (
            chords.map(c => (
              <button
                key={c.symbol}
                type="button"
                className="gc-kbd-accessory__btn gc-kbd-accessory__btn--chord"
                onClick={() => onInsert(`[${c.symbol}]`)}
                title={`${c.degree} – ${c.symbol}`}
              >
                <span className="gc-kbd-accessory__chord-name">{c.display}</span>
                <span className="gc-kbd-accessory__chord-degree">{c.degree}</span>
              </button>
            ))
          ) : (
            <span className="gc-kbd-accessory__no-key">Set a key in Info tab</span>
          )}
          <button
            type="button"
            className="gc-kbd-accessory__btn gc-kbd-accessory__btn--guide"
            onClick={onGuideOpen}
            title="ChordPro syntax guide"
            aria-label="Open ChordPro guide"
          >
            ?
          </button>
        </div>
      </div>

      <MobileActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More Sections"
      >
        <div className="gc-kbd-accessory__more-sections">
          {MORE_SECTIONS.map(s => (
            <button
              key={s.directive}
              type="button"
              className="gc-btn gc-btn--secondary"
              onClick={() => { onWrap({ directive: s.directive, label: s.title }); setMoreOpen(false) }}
            >
              {s.title}
            </button>
          ))}
        </div>
      </MobileActionSheet>
    </>
  )
}
