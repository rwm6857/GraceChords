export function planSongRender(songs, opts = {}) {
  const isMulti = Array.isArray(songs);
  const defaults = { pageSize: 'LETTER', basePt: 12, columns: 'auto', showChords: true };
  const o = { ...defaults, ...opts };
  const songArr = isMulti ? songs : [songs];
  const blocks = [];
  for (const song of songArr) {
    const title = song.title || 'Untitled';
    blocks.push({ kind: 'songHeader', title, keepTogether: true, keepLastNWithNext: 2 });
    for (const sec of song.lyricsBlocks || []) {
      const lines = [];
      for (const ln of sec.lines || []) {
        const lyric = ln.plain || '';
        if (o.showChords && ln.chordPositions && ln.chordPositions.length) {
          const max = Math.max(lyric.length, ...ln.chordPositions.map(c => c.index + c.sym.length));
          const arr = Array(max).fill(' ');
          for (const c of ln.chordPositions) {
            for (let i = 0; i < c.sym.length; i++) arr[c.index + i] = c.sym[i];
          }
          lines.push({ text: arr.join('').replace(/\s+$/, ''), chord: true });
        }
        lines.push({ text: lyric, chord: false });
      }
      blocks.push({
        kind: 'section',
        title: sec.section || '',
        lines,
        keepTogether: true,
        keepLastNWithNext: 2,
      });
    }
  }
  const columns = o.columns === 'auto' ? (blocks.length > 18 ? 2 : 1) : o.columns;
  const docTitle =
    o.docTitle ||
    (isMulti ? `Set — ${songArr.map((s) => s.title).join(', ')}` : songArr[0].title || 'Untitled');
  return {
    page: { size: o.pageSize, width: 612, height: 792, margin: { t: 54, r: 48, b: 54, l: 48 } },
    typography: { basePt: o.basePt, headerScale: 1.3, sans: 'NotoSans', mono: 'NotoSansMono' },
    behavior: { showChords: o.showChords, widowOrphanClamp: 2, keepTogetherSections: true },
    columns,
    blocks,
    docTitle,
  };
}
