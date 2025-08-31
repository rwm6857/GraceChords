import { describe, it, expect } from 'vitest';
import { sectionsFromSong } from '../utils/pdf/index.js';

describe('sectionsFromSong', () => {
  it('injects chord tokens and section labels', () => {
    const song = {
      lyricsBlocks: [
        {
          section: 'Verse 1',
          lines: [
            { plain: 'word', chordPositions: [ { index: 3, sym: 'G' }, { index: 0, sym: 'D' } ] }
          ]
        }
      ]
    };
    const sections = sectionsFromSong(song);
    expect(sections).toHaveLength(1);
    expect(sections[0].text).toBe('[Verse 1]\n[D]wor[G]d');
  });
});

