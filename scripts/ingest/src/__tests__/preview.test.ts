import { describe, expect, it } from 'vitest'
import { renderPreviewHtml } from '../utils/preview.js'

describe('renderPreviewHtml', () => {
  it('renders meaningful default labels for unnamed section directives', () => {
    const chordpro = '{title: Test}\n{sov}\nLine one\n{eov}\n{soc}\nLine two\n{eoc}\n'
    const html = renderPreviewHtml(chordpro)
    expect(html).toContain('## Verse')
    expect(html).toContain('## Chorus')
    expect(html).not.toContain('## Section')
  })

  it('keeps explicit section labels when provided', () => {
    const chordpro = '{title: Test}\n{soc Pre-Chorus}\nLine one\n{eoc}\n'
    const html = renderPreviewHtml(chordpro)
    expect(html).toContain('## Pre-Chorus')
  })
})
