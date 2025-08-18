import { SongDoc, SongSection, SongLine, ChordPlacement } from './types';

const RX_LONG_DIR = /^\{(start_of|end_of)_(verse|chorus|bridge|intro|tag|outro)(?::\s*([^}]+))?\}$/i;
const RX_SHORT_DIR = /^\{(sov|eov|soc|eoc|sob|eob)\}$/i;
const SHORT_MAP: Record<string, { start: boolean; kind: string }> = {
  sov: { start: true,  kind: 'verse' },
  eov: { start: false, kind: 'verse' },
  soc: { start: true,  kind: 'chorus' },
  eoc: { start: false, kind: 'chorus' },
  sob: { start: true,  kind: 'bridge' },
  eob: { start: false, kind: 'bridge' },
};

const RX_PLAIN_HEADER = /^(verse|chorus|bridge|intro|tag|outro)(?:\s+(\d+))?$/i;
const RX_META = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}$/;

// Inline chord parser
const RX_CHORD = /\[([^\]]+)\]/g;
function parseInline(line: string): SongLine {
  const chords: ChordPlacement[] = [];
  let plain = '';
  let last = 0;
  line.replace(RX_CHORD, (match, sym: string, offset: number) => {
    plain += line.slice(last, offset);
    chords.push({ sym, index: plain.length });
    last = offset + match.length;
    return match;
  });
  plain += line.slice(last);
  return { lyrics: plain, chords };
}

function isPlainHeader(line: string) {
  return RX_PLAIN_HEADER.test(line.trim());
}
function normalizePlainHeader(line: string) {
  const m = RX_PLAIN_HEADER.exec(line.trim());
  if (!m) return { kind: 'verse', label: '' };
  const kind = m[1].toLowerCase();
  const label = m[2] ? `${capitalize(kind)} ${m[2]}` : capitalize(kind);
  return { kind, label };
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

type Dir = { start: boolean; kind: string; label?: string };
function parseDirective(raw: string): Dir | null {
  const t = raw.trim();
  let m = RX_LONG_DIR.exec(t);
  if (m) {
    return {
      start: m[1].toLowerCase() === 'start_of',
      kind: m[2].toLowerCase(),
      label: (m[3] || '').trim() || undefined,
    };
  }
  m = RX_SHORT_DIR.exec(t);
  if (m) {
    const map = SHORT_MAP[m[1].toLowerCase()];
    if (map) return { start: map.start, kind: map.kind };
  }
  return null;
}

export function parseChordProOrLegacy(input: string): SongDoc {
  const lines = input.split(/\r?\n/);

  // detect start/end directives
  let hasEnv = false;
  for (const L of lines) {
    const t = L.trim();
    if (RX_LONG_DIR.test(t) || RX_SHORT_DIR.test(t)) { hasEnv = true; break; }
  }

  const doc: SongDoc = { meta: {}, sections: [] };
  let cur: SongSection | null = null;

  const openSection = (kind: string, label?: string) => {
    if (cur) doc.sections.push(cur);
    const lbl = label || capitalize(kind);
    cur = { kind, label: lbl, lines: [] };
  };
  const closeSection = () => {
    if (cur) { doc.sections.push(cur); cur = null; }
  };

  for (const raw of lines) {
    const t = raw.trim();

    if (t === '') {
      if (cur) cur.lines.push({ lyrics: '', chords: [] })
      continue
    }

    // metadata lines
    const mMeta = RX_META.exec(t);
    if (mMeta && !RX_LONG_DIR.test(t) && !RX_SHORT_DIR.test(t)) {
      const key = mMeta[1].trim().toLowerCase();
      const val = mMeta[2].trim();
      if (key === 'title') doc.meta.title = val;
      else if (key === 'key') doc.meta.key = val;
      else {
        if (!doc.meta.meta) doc.meta.meta = {};
        doc.meta.meta[key] = val;
      }
      continue;
    }

    if (hasEnv) {
      const dir = parseDirective(t);
      if (dir) { dir.start ? openSection(dir.kind, dir.label) : closeSection(); continue; }
      if (t.startsWith('{') && t.endsWith('}')) continue; // unknown directive
      if (!cur) openSection('verse', 'Verse');
      cur.lines.push(parseInline(raw));
      continue;
    }

    if (isPlainHeader(raw)) {
      const { kind, label } = normalizePlainHeader(raw);
      openSection(kind, label);
      continue;
    }

    if (t.startsWith('{') && t.endsWith('}')) {
      // ignore other directives/comments
      continue;
    }

    if (!cur) openSection('verse', 'Verse');
    cur.lines.push(parseInline(raw));
  }

  if (cur) closeSection();
  return doc;
}
