// Directives the ChordPro parser (packages/core/src/chordpro/parser.ts) reads from
// the song body: long and short section markers, comments, and capo. An imported
// file's line matching one of these must stay in the body rather than being
// treated as metadata, or the section/comment/capo is silently lost.
const BODY_DIRECTIVE_RE =
  /^\{\s*(?:start_of_\w+|end_of_\w+|sov|eov|soc|eoc|sob|eob|c|comment|com|ment|capo)(?=[\s:}])/i

export function isBodyDirective(line) {
  return BODY_DIRECTIVE_RE.test(String(line || '').trim())
}
