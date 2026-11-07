// The R2 key stem for a song's slide deck: `pptx/<stem>.pptx`. Songs imported
// from the original .chordpro files keep that file's stem in `source_filename`,
// which can differ from the slug, so readers and the uploader must both derive
// the stem here or a deck uploaded from the editor is never found.
export function pptxKeyStem(song) {
  if (!song) return ''
  if (song.source_filename) return song.source_filename
  return String(song.slug || '').replace(/-/g, '_')
}
