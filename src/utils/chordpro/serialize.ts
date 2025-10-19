import { SongDoc, SongSection, SongLine, InstrumentalDirective } from './types';

export type SerializeOpts = {
  useDirectives?: boolean;      // default true
  includeMeta?: boolean;        // default true
};

export function slugifyUnderscore(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
// Backward-compat alias (deprecated)
export const kebab = slugifyUnderscore;

function cleanLabel(s?: string) {
  return (s || '').replace(/[{}]/g, '').trim();
}

function formatInstrumentalDirective(spec?: InstrumentalDirective | null): string {
  if (!spec || !Array.isArray(spec.chords)) return '';
  const chords = spec.chords.map((ch) => cleanLabel(ch)).filter(Boolean);
  if (!chords.length) return '';
  const repeat = spec.repeat && spec.repeat > 1 ? Math.floor(spec.repeat) : undefined;
  if (repeat && chords.length) {
    chords[chords.length - 1] = `${chords[chords.length - 1]} x${repeat}`;
  }
  return `{instrumental: ${chords.join(', ')}}`;
}

function formatInstrumentalPlain(spec?: InstrumentalDirective | null): string {
  if (!spec || !Array.isArray(spec.chords)) return '';
  const chords = spec.chords.map((ch) => cleanLabel(ch)).filter(Boolean);
  if (!chords.length) return '';
  const repeat = spec.repeat && spec.repeat > 1 ? Math.floor(spec.repeat) : undefined;
  if (repeat && chords.length) {
    chords[chords.length - 1] = `${chords[chords.length - 1]} x${repeat}`;
  }
  return chords.join('  //  ');
}

function collectInstrumentals(sec: SongSection): InstrumentalDirective[] {
  const list: InstrumentalDirective[] = [];
  const seen = new Set<InstrumentalDirective>();
  if (sec.instrumental && !seen.has(sec.instrumental)) {
    list.push(sec.instrumental);
    seen.add(sec.instrumental);
  }
  for (const ln of sec.lines || []) {
    if (ln.instrumental && !seen.has(ln.instrumental)) {
      list.push(ln.instrumental);
      seen.add(ln.instrumental);
    }
  }
  return list;
}

// Insert inline chords into a plain lyric line using chord placements.
function lineWithChords(ln: SongLine, useDirectives: boolean): string {
  if (ln.instrumental) {
    return useDirectives ? formatInstrumentalDirective(ln.instrumental) : formatInstrumentalPlain(ln.instrumental);
  }
  if (ln.comment) return useDirectives ? `{c: ${cleanLabel(ln.comment)}}` : ln.comment;
  if (!ln?.chords?.length) return ln.lyrics || '';
  const chars = Array.from(ln.lyrics || '');
  const byIndex = new Map<number, string[]>();
  for (const c of ln.chords) {
    const arr = byIndex.get(c.index) || [];
    arr.push(c.sym);
    byIndex.set(c.index, arr);
  }
  let out = '';
  for (let i = 0; i <= chars.length; i++) {
    if (byIndex.has(i)) {
      const syms = byIndex.get(i)!;
      out += syms.map(s => `[${s}]`).join('');
    }
    if (i < chars.length) out += chars[i];
  }
  return out.replace(/[ \t]+$/, '');
}

function emitDirectiveSection(sec: SongSection): string {
  const kind = (sec.kind || 'verse').toLowerCase();
  if (kind === 'instrumental') {
    const rows = collectInstrumentals(sec)
      .map((spec) => formatInstrumentalDirective(spec))
      .filter(Boolean);
    return rows.join('\n');
  }
  if (kind === 'comment') {
    return (sec.lines || [])
      .map((ln) => lineWithChords(ln, true))
      .join('\n');
  }
  const label = cleanLabel(sec.label);
  const start = `{start_of_${kind}${label ? `: ${label}` : ''}}`;
  const end = `{end_of_${kind}}`;
  const body = (sec.lines || [])
    .map((ln) => lineWithChords(ln, true))
    .join('\n');
  return `${start}\n${body}\n${end}`;
}

function emitPlainSection(sec: SongSection): string {
  const kind = (sec.kind || '').toLowerCase();
  const header = (sec.label || sec.kind || '').trim() || 'Verse';
  if (kind === 'instrumental') {
    const rows = collectInstrumentals(sec)
      .map((spec) => formatInstrumentalPlain(spec))
      .filter(Boolean);
    const body = rows.join('\n');
    return body ? `${header}\n${body}` : header;
  }
  const lines = (sec.lines || [])
    .map((ln) => lineWithChords(ln, false))
    .join('\n');
  return `${header}\n${lines}`;
}

export function serializeChordPro(doc: SongDoc, opts: SerializeOpts = {}): string {
  const useDirectives = opts.useDirectives !== false;
  const includeMeta = opts.includeMeta !== false;

  const metaLines: string[] = [];
  const title = doc?.meta?.title || '';
  const key = doc?.meta?.key || '';
  if (title) metaLines.push(`{title: ${cleanLabel(title)}}`);
  if (key) metaLines.push(`{key: ${cleanLabel(key)}}`);
  if (typeof doc?.meta?.capo === 'number') metaLines.push(`{capo: ${doc.meta.capo}}`);
  if (doc.chordDefs) {
    for (const d of doc.chordDefs) metaLines.push(`{${d.raw}}`);
  }
  if (doc.layoutHints?.requestedColumns === 2) metaLines.push('{columns: 2}');

  const extra = doc?.meta?.meta || {};
  for (const [k, v] of Object.entries(extra)) {
    if (!v) continue;
    // Emit unknown meta keys as plain {key: value} lines to preserve original tags
    metaLines.push(`{${k}: ${String(v)}}`);
  }
  const head = includeMeta ? metaLines.join('\n') : '';

  const parts: string[] = [];
  (doc.sections || []).forEach((sec, i) => {
    if (useDirectives) parts.push(emitDirectiveSection(sec));
    else parts.push(emitPlainSection(sec));
    if (doc.layoutHints?.columnBreakAfter?.includes(i + 1)) parts.push('{column_break}');
  });
  const body = parts.join('\n\n');

  return [head, body].filter(Boolean).join('\n\n').replace(/\r\n/g, '\n');
}
