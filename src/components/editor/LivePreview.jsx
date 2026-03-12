import React, { useState } from 'react'

// Parse a line that may contain inline [Chord] markers
// Returns array of { chord, lyric } pairs
function parseChordLine(line) {
  const segments = []
  const re = /\[([^\]]+)\]/g
  let lastIndex = 0
  let match

  while ((match = re.exec(line)) !== null) {
    const lyricBefore = line.slice(lastIndex, match.index)
    segments.push({ chord: match[1], lyric: lyricBefore })
    lastIndex = re.lastIndex
  }

  // Remaining text after last chord (no chord)
  const remaining = line.slice(lastIndex)
  if (remaining || segments.length === 0) {
    segments.push({ chord: null, lyric: remaining })
  }

  return segments
}

function hasChords(line) {
  return /\[[^\]]+\]/.test(line)
}

// Extract directive type and label from {directive_name: Label}
function parseDirective(line) {
  const m = line.match(/^\{(start_of_\w+|end_of_\w+|[^}:]+)(?::\s*([^}]*))?\}/)
  if (!m) return null
  return { type: m[1].trim(), label: (m[2] || '').trim() }
}

function renderLine(line, idx) {
  if (!hasChords(line)) {
    return (
      <div key={idx} className="gc-live-preview__line">
        <span className="gc-live-preview__lyric">{line || '\u00A0'}</span>
      </div>
    )
  }

  const segments = parseChordLine(line)
  return (
    <div key={idx} className="gc-live-preview__line gc-live-preview__chord-row">
      {segments.map((seg, si) => (
        <span key={si} className="gc-live-preview__chord-col">
          <span className="gc-live-preview__chord">{seg.chord || ' '}</span>
          <span className="gc-live-preview__lyric">{seg.lyric || ' '}</span>
        </span>
      ))}
    </div>
  )
}

export default function LivePreview({ content, metadata }) {
  const [enabled, setEnabled] = useState(false)

  return (
    <div className="gc-live-preview">
      <div className="gc-live-preview__toggle-bar">
        <span className="gc-live-preview__title">Live Preview</span>
        <button
          className="gc-btn gc-btn--secondary gc-btn--sm"
          type="button"
          onClick={() => setEnabled(v => !v)}
        >
          {enabled ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {enabled && (
        <div className="gc-live-preview__panel">
          {metadata?.title && (
            <h2 className="gc-live-preview__song-title">{metadata.title}</h2>
          )}
          {metadata?.artist && (
            <p className="gc-live-preview__song-artist">{metadata.artist}</p>
          )}

          {(content || '').split('\n').map((line, idx) => {
            const trimmed = line.trim()
            const directive = parseDirective(trimmed)

            if (directive) {
              if (directive.type.startsWith('start_of_')) {
                const sectionName = directive.label || directive.type.replace('start_of_', '').replace(/_/g, ' ')
                return (
                  <div key={idx} className="gc-live-preview__section-header">
                    {sectionName}
                  </div>
                )
              }
              // end_of_* directives: skip rendering
              return null
            }

            return renderLine(line, idx)
          })}
        </div>
      )}
    </div>
  )
}
