/** @vitest-environment happy-dom */

import { describe, it, expect, vi } from 'vitest';
import { downloadSingleSongPdf } from '../../pdf/index.js';

describe('pdf2 render', () => {
  it('produces a non-empty PDF blob', async () => {
    const song = {
      title: 'Test Song',
      lyricsBlocks: [
        {
          section: 'Verse 1',
          lines: [
            {
              plain: 'Hello world',
              chordPositions: [
                { index: 0, sym: 'C' },
                { index: 6, sym: 'G' },
              ],
            },
          ],
        },
        {
          section: 'Chorus',
          lines: [
            {
              plain: 'Sing along',
              chordPositions: [
                { index: 0, sym: 'F' },
              ],
            },
          ],
        },
      ],
    };

    const blobs = [];
    const origCreate = global.URL.createObjectURL;
    const origRevoke = global.URL.revokeObjectURL;
    global.URL.createObjectURL = vi.fn((blob) => {
      blobs.push(blob);
      return 'blob:mock';
    });
    global.URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadSingleSongPdf(song);

    expect(blobs[0]).toBeInstanceOf(Blob);
    expect(blobs[0].size).toBeGreaterThan(0);

    clickSpy.mockRestore();
    global.URL.createObjectURL = origCreate;
    global.URL.revokeObjectURL = origRevoke;
  });
});

