import { SongDoc, SongSection, SongLine } from './types';

export type SerializeOpts = {
  useDirectives?: boolean;      // default true
  includeMeta?: boolean;        // default true
};

export function kebab(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanLabel(s?: string) {
  return (s || '').replace(/[{}]/g, '').trim();
}

// Insert inline chords into a plain lyric line using chord placements.
function lineWithChords(ln: SongLine): string {
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

function emitSection(sec: SongSection): string {
  const kind = (sec.kind || 'verse').toLowerCase();
  const label = cleanLabel(sec.label);
  const start = `{start_of_${kind}${label ? `: ${label}` : ''}}`;
  const end = `{end_of_${kind}}`;
  const body = (sec.lines || []).map(lineWithChords).join('\n');
  return `${start}\n${body}\n${end}`;
}

export function serializeChordPro(doc: SongDoc, opts: SerializeOpts = {}): string {
  const useDirectives = opts.useDirectives !== false;
  const includeMeta = opts.includeMeta !== false;

  const metaLines: string[] = [];
  const title = doc?.meta?.title || '';
  const key = doc?.meta?.key || '';
  if (title) metaLines.push(`{title: ${cleanLabel(title)}}`);
  if (key) metaLines.push(`{key: ${cleanLabel(key)}}`);

  const extra = doc?.meta?.meta || {};
  for (const [k, v] of Object.entries(extra)) {
    if (!v) continue;
    metaLines.push(`{meta: ${k} ${String(v).trim()}}`);
  }
  const head = includeMeta ? metaLines.join('\n') : '';

  const body = (doc.sections || []).map(sec => {
    if (useDirectives) return emitSection(sec);
    const hdr = (sec.label || sec.kind || '').trim() || 'Verse';
    const lines = (sec.lines || []).map(lineWithChords).join('\n');
    return `${hdr}\n${lines}`;
  }).join('\n\n');

  return [head, body].filter(Boolean).join('\n\n').replace(/\r\n/g, '\n');
}
