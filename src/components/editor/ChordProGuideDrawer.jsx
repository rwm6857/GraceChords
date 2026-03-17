import React, { useEffect } from 'react'

export default function ChordProGuideDrawer({ open, onClose }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="gc-guide-drawer__backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        className={`gc-guide-drawer${open ? ' gc-guide-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="ChordPro guide"
        aria-hidden={!open}
      >
        <div className="gc-guide-drawer__header">
          <h2 className="gc-guide-drawer__title">ChordPro Guide</h2>
          <button
            type="button"
            className="gc-guide-drawer__close"
            onClick={onClose}
            aria-label="Close guide"
          >
            ✕
          </button>
        </div>

        <div className="gc-guide-drawer__body">

          <section className="gc-guide-drawer__section">
            <h3 className="gc-guide-drawer__section-title">Inline Chords</h3>
            <p className="gc-guide-drawer__text">
              Place a chord in square brackets immediately before the syllable it falls on — no space between the bracket and the word.
            </p>
            <pre className="gc-guide-drawer__code">{`[G]Amazing [C]grace, how [D]sweet the [G]sound`}</pre>
          </section>

          <section className="gc-guide-drawer__section">
            <h3 className="gc-guide-drawer__section-title">Section Directives</h3>
            <p className="gc-guide-drawer__text">
              Wrap lyric blocks with opening and closing directives. The label after the colon is optional.
            </p>
            <pre className="gc-guide-drawer__code">{`{start_of_verse: Verse 1}
[G]Amazing [C]grace
{end_of_verse}

{start_of_chorus: Chorus}
[D]How [G]sweet the [Em]sound
{end_of_chorus}`}</pre>
            <p className="gc-guide-drawer__text" style={{ marginTop: 'var(--space-2)' }}>
              <strong>Available sections:</strong>{' '}
              <code>verse</code>, <code>chorus</code>, <code>bridge</code>, <code>pre_chorus</code>,{' '}
              <code>intro</code>, <code>outro</code>, <code>tag</code>, <code>interlude</code>
            </p>
          </section>

          <section className="gc-guide-drawer__section">
            <h3 className="gc-guide-drawer__section-title">Comments</h3>
            <p className="gc-guide-drawer__text">
              Lines starting with <code>#</code> are ignored during rendering.
            </p>
            <pre className="gc-guide-drawer__code">{`# This section is optional
[Am]Some lyric here`}</pre>
          </section>

          <section className="gc-guide-drawer__section gc-guide-drawer__section--warning">
            <h3 className="gc-guide-drawer__section-title">Not Supported in GraceChords</h3>
            <p className="gc-guide-drawer__text">
              The following standard ChordPro features are <strong>not rendered</strong> and should not be placed in the body field:
            </p>
            <ul className="gc-guide-drawer__list">
              <li><code>{'{capo}'}</code>, <code>{'{tempo}'}</code>, <code>{'{key}'}</code>, <code>{'{title}'}</code> — use the metadata fields instead</li>
              <li>Grid / tab notation</li>
              <li><code>{'{define}'}</code> directives</li>
              <li><code>{'{chord}'}</code> inline definitions</li>
            </ul>
          </section>

          <section className="gc-guide-drawer__section">
            <h3 className="gc-guide-drawer__section-title">Tips</h3>
            <ul className="gc-guide-drawer__list">
              <li>Chords go <em>immediately before</em> the syllable — no space between <code>[chord]</code> and the word.</li>
              <li>Use the <strong>Quick Chords</strong> buttons above the editor to insert chords at the cursor.</li>
              <li>Use the <strong>Section</strong> buttons to automatically wrap selected text with the correct directives.</li>
              <li>Press <kbd>Ctrl+1</kbd> through <kbd>Ctrl+7</kbd> to insert scale degrees I–VII directly.</li>
            </ul>
          </section>

        </div>
      </div>
    </>
  )
}
