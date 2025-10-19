import { SongDoc, SongSection, SongLine, ChordPlacement, InstrumentalDirective } from './types';

const RX_LONG_DIR = /^\{(start_of|end_of)_(verse|chorus|bridge|intro|tag|outro)(?::\s*([^}]+))?\}$/i;
// Short-form environments optionally accept a label after the code, with or without a colon, e.g.
// {sov Verse 1} or {sov: Verse 1}
const RX_SHORT_DIR = /^\{\s*(sov|eov|soc|eoc|sob|eob)(?::?\s*([^}]+))?\s*\}$/i;
const RX_CAPO = /^\{capo:\s*(\d+)\}$/i;
const RX_COLUMNS = /^\{columns:\s*(\d+)\}$/i;
const RX_COL_BREAK = /^\{column_break\}$/i;
const RX_COMMENT = /^\{\s*(c|comment|com|ment)(?=\s|:)(?::?\s*([^}]+))?\s*\}$/i;
const RX_INSTRUMENTAL = /^\{\s*(instrumental|inst|i)(?=\s|:|})(?::?\s*([^}]+))?\s*\}$/i;
const RX_DEFINE = /^\{define:\s*([^}]+)\}$/i;
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

function parseInstrumentalDirective(body: string): InstrumentalDirective {
  const chords: string[] = [];
  let repeat: number | undefined;
  const raw = (body || '').trim();
  if (!raw) return { chords, repeat };

  const repeatToken = (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) return { chord: '', rep: undefined as number | undefined };
    const directRepeat = trimmed.match(/^(.*?)(x\d+)$/i);
    if (directRepeat && directRepeat[1].trim()) {
      const chord = directRepeat[1].trim();
      const rep = parseInt(directRepeat[2].slice(1), 10);
      return { chord, rep: isNaN(rep) ? undefined : rep };
    }
    return { chord: trimmed, rep: undefined };
  };

  const assignRepeat = (token: string) => {
    if (/^x\d+$/i.test(token.trim())) {
      const rep = parseInt(token.trim().slice(1), 10);
      if (!Number.isNaN(rep)) repeat = rep;
      return true;
    }
    return false;
  };

  const pushPart = (part: string) => {
    if (!part) return;
    const { chord, rep } = repeatToken(part);
    if (chord) chords.push(chord);
    if (rep && !Number.isNaN(rep)) repeat = rep;
  };

  if (raw.includes(',')) {
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      pushPart(part);
    }
  } else {
    const tokens = raw.split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (assignRepeat(tok)) continue;
      const { chord, rep } = repeatToken(tok);
      if (chord) chords.push(chord);
      if (rep && !Number.isNaN(rep)) repeat = rep;
    }
  }

  return { chords, repeat };
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
    const code = m[1].toLowerCase();
    const label = (m[2] || '').trim();
    const map = SHORT_MAP[code];
    if (map) return { start: map.start, kind: map.kind, label: map.start && label ? label : undefined };
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

  const doc: SongDoc = { meta: {}, sections: [], layoutHints: { columnBreakAfter: [] }, chordDefs: [] };
  let cur: SongSection | null = null;

  const openSection = (kind: string, label?: string) => {
    if (cur) doc.sections.push(cur);
    const lbl = label || capitalize(kind);
    cur = { kind, label: lbl, lines: [] };
  };
  const closeSection = () => {
    if (cur) { doc.sections.push(cur); cur = null; }
  };

  const insertStandaloneSection = (section: SongSection) => {
    if (cur && cur.lines.length) {
      const resumeLabel = cur.label;
      const resumeKind = cur.kind;
      doc.sections.push(cur);
      cur = { kind: resumeKind, label: resumeLabel, lines: [] };
    }
    doc.sections.push(section);
  };

  for (const raw of lines) {
    const t = raw.trim();

    // Ignore ChordPro-style comment lines beginning with '#'
    if (t.startsWith('#')) { continue }

    if (t === '') {
      if (cur) cur.lines.push({ lyrics: '', chords: [] })
      continue
    }

    // specific directives
    let m;
    if ((m = RX_CAPO.exec(t))) { doc.meta.capo = parseInt(m[1], 10); continue; }
    if ((m = RX_COLUMNS.exec(t))) {
      const n = parseInt(m[1], 10);
      doc.layoutHints!.requestedColumns = n === 2 ? 2 : 1;
      continue;
    }
    if (RX_COL_BREAK.test(t)) { doc.layoutHints!.columnBreakAfter!.push(doc.sections.length); continue; }
    if ((m = RX_COMMENT.exec(t))) {
      const note = (m[2] || '').trim();
      if (!note) continue;
      const commentSection: SongSection = {
        kind: 'comment',
        label: '',
        lines: [{ lyrics: '', chords: [], comment: note }],
      };
      insertStandaloneSection(commentSection);
      continue;
    }
    if ((m = RX_INSTRUMENTAL.exec(t))) {
      const spec = parseInstrumentalDirective(m[2] || '');
      const instLine: SongLine = { lyrics: '', chords: [], instrumental: spec };
      const instSection: SongSection = {
        kind: 'instrumental',
        label: 'Instrumental',
        lines: [instLine],
        instrumental: spec,
      };
      insertStandaloneSection(instSection);
      continue;
    }
    if ((m = RX_DEFINE.exec(t))) {
      const body = m[1].trim();
      const name = body.split(/\s+/)[0];
      doc.chordDefs!.push({ name, raw: `define: ${body}` });
      continue;
    }

    // metadata lines
    const mMeta = RX_META.exec(t);
    if (mMeta && !RX_LONG_DIR.test(t) && !RX_SHORT_DIR.test(t)) {
      const key = mMeta[1].trim().toLowerCase();
      const val = mMeta[2].trim();
      if (key === 'title') doc.meta.title = val;
      else if (key === 'key') doc.meta.key = val;
      else if (key === 'capo') doc.meta.capo = parseInt(val, 10);
      else if (key === 'meta') {
        const [mk, ...rest] = val.split(/\s+/);
        if (mk) {
          if (!doc.meta.meta) doc.meta.meta = {};
          doc.meta.meta[mk.toLowerCase()] = rest.join(' ').trim();
        }
      } else {
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
