import React, { useEffect } from 'react'

// Parse a line that may contain inline [Chord] markers
function parseChordLine(line) {
  const segments = []
  const re = /\[([^\]]+)\]/g
  let lastIndex = 0
  let match

  while ((match = re.exec(line)) !== null) {
    segments.push({ chord: match[1], lyric: line.slice(lastIndex, match.index) })
    lastIndex = re.lastIndex
  }
  const remaining = line.slice(lastIndex)
  if (remaining || segments.length === 0) segments.push({ chord: null, lyric: remaining })
  return segments
}

function hasChords(line) {
  return /\[[^\]]+\]/.test(line)
}

function parseDirective(line) {
  const m = line.match(/^\{(start_of_\w+|end_of_\w+|[^}:]+)(?::\s*([^}]*))?\}/)
  if (!m) return null
  return { type: m[1].trim(), label: (m[2] || '').trim() }
}

function renderLine(line, idx) {
  if (!hasChords(line)) {
    return (
      <div key={idx} className="gc-preview-modal__line">
        <span className="gc-preview-modal__lyric">{line || '\u00A0'}</span>
      </div>
    )
  }
  const segments = parseChordLine(line)
  return (
    <div key={idx} className="gc-preview-modal__line gc-preview-modal__chord-row">
      {segments.map((seg, si) => (
        <span key={si} className="gc-preview-modal__chord-col">
          <span className="gc-preview-modal__chord">{seg.chord || ' '}</span>
          <span className="gc-preview-modal__lyric">{seg.lyric || ' '}</span>
        </span>
      ))}
    </div>
  )
}

export default function LivePreviewModal({ content, metadata, onClose }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="gc-preview-modal" role="dialog" aria-modal="true" aria-label="Song preview">
      <div className="gc-preview-modal__backdrop" onClick={onClose} />
      <div className="gc-preview-modal__panel">
        <div className="gc-preview-modal__header">
          <div>
            {metadata?.title && <h2 className="gc-preview-modal__title">{metadata.title}</h2>}
            {metadata?.currentKey && (
              <span className="gc-preview-modal__key">Key: {metadata.currentKey}</span>
            )}
          </div>
          <button
            type="button"
            className="gc-preview-modal__close"
            onClick={onClose}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        <div className="gc-preview-modal__body">
          {(content || '').split('\n').map((line, idx) => {
            const trimmed = line.trim()
            const directive = parseDirective(trimmed)

            if (directive) {
              if (directive.type.startsWith('start_of_')) {
                const name = directive.label || directive.type.replace('start_of_', '').replace(/_/g, ' ')
                return (
                  <div key={idx} className="gc-preview-modal__section-header">
                    {name}
                  </div>
                )
              }
              return null
            }

            return renderLine(line, idx)
          })}
        </div>
      </div>
    </div>
  )
}
