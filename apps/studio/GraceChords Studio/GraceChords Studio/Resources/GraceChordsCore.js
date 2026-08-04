// GENERATED FILE — do not edit.
// Built from packages/core by apps/studio/js/build-core-bundle.mjs.
// Exposes GraceChordsCore.transpose() on the JavaScriptCore global object.
var GraceChordsCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // apps/studio/js/entry.mjs
  var entry_exports = {};
  __export(entry_exports, {
    chordToken: () => chordToken,
    chordVariantsJSON: () => chordVariantsJSON,
    diatonicChordsJSON: () => diatonicChordsJSON,
    formatKey: () => formatKey,
    hasMinRole: () => hasMinRole2,
    insertAtCursorJSON: () => insertAtCursorJSON,
    lintToJSON: () => lintToJSON,
    parseToJSON: () => parseToJSON,
    pdfDraftJSON: () => pdfDraftJSON,
    renderToJSON: () => renderToJSON,
    roleOrderJSON: () => roleOrderJSON,
    sectionPresetsJSON: () => sectionPresetsJSON,
    slugify: () => slugify2,
    stepsBetween: () => stepsBetween2,
    transpose: () => transpose,
    wrapSectionJSON: () => wrapSectionJSON
  });

  // packages/core/src/chordpro/index.js
  var KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var FLAT = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  function norm(n) {
    return FLAT[n] || n;
  }
  function keyRoot(key) {
    if (!key) return "";
    const m = String(key).match(/^\s*([A-G][#b]?)/);
    if (!m) return "";
    return norm(m[1]);
  }
  function stepsBetween(fromKey, toKey) {
    if (!fromKey || !toKey) return 0;
    const aRoot = keyRoot(fromKey);
    const bRoot = keyRoot(toKey);
    const a = KEYS.indexOf(aRoot);
    const b = KEYS.indexOf(bRoot);
    if (a === -1 || b === -1) return 0;
    return (b - a + 12) % 12;
  }
  function transposeSymPrefer(sym, steps, defaultPreferFlat = false) {
    if (steps === 0) return sym;
    if (sym.includes("/")) {
      const [r, b] = sym.split("/");
      return transposeSymPrefer(r, steps, defaultPreferFlat) + "/" + transposeSymPrefer(b, steps, defaultPreferFlat);
    }
    const m = sym.match(/^([A-G])([#b]?)(.*)$/);
    if (!m) return sym;
    const [, base, acc, rest] = m;
    const preferFlat = acc === "b" ? true : acc === "#" ? false : defaultPreferFlat;
    const idx = KEYS.indexOf(norm(base + (acc || "")));
    if (idx === -1) return sym;
    const root = KEYS[(idx + steps + 12) % 12];
    const outRoot = preferFlat && SHARP_TO_FLAT[root] ? SHARP_TO_FLAT[root] : root;
    return outRoot + (rest || "");
  }
  var SHARP_TO_FLAT = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };

  // packages/core/src/chordpro/solfege.js
  var ROOT_TO_SOLFEGE = {
    C: "Do",
    D: "Re",
    E: "Mi",
    F: "Fa",
    G: "Sol",
    A: "La",
    B: "Si"
  };
  function rootToSolfege(rootWithAcc) {
    const m = String(rootWithAcc || "").match(/^([A-G])([#b]?)$/);
    if (!m) return rootWithAcc;
    const [, base, acc] = m;
    return (ROOT_TO_SOLFEGE[base] || base) + (acc || "");
  }
  function symToSolfege(sym) {
    if (!sym) return sym;
    const s = String(sym);
    if (s.includes("/")) {
      const [r, b] = s.split("/");
      return symToSolfege(r) + "/" + symToSolfege(b);
    }
    const m = s.match(/^([A-G][#b]?)(.*)$/);
    if (!m) return s;
    return rootToSolfege(m[1]) + (m[2] || "");
  }
  function formatChord(sym, opts = {}) {
    const style = opts.style || "letters";
    if (!sym) return sym;
    if (style === "solfege") return symToSolfege(sym);
    return String(sym);
  }
  function formatKeyDisplay(key, style = "letters") {
    if (!key) return key;
    if (style === "solfege") return symToSolfege(key);
    return String(key);
  }

  // packages/core/src/chordpro/parser.ts
  var RX_LONG_DIR = /^\{(start_of|end_of)_(verse|chorus|bridge|intro|tag|outro)(?::\s*([^}]+))?\}$/i;
  var RX_SHORT_DIR = /^\{\s*(sov|eov|soc|eoc|sob|eob)(?::?\s*([^}]+))?\s*\}$/i;
  var RX_CAPO = /^\{capo:\s*(\d+)\}$/i;
  var RX_COLUMNS = /^\{columns:\s*(\d+)\}$/i;
  var RX_COL_BREAK = /^\{column_break\}$/i;
  var RX_COMMENT = /^\{\s*(c|comment|com|ment)(?=\s|:)(?::?\s*([^}]+))?\s*\}$/i;
  var RX_INSTRUMENTAL = /^\{\s*(instrumental|inst|i)(?=\s|:|})(?::?\s*([^}]+))?\s*\}$/i;
  var RX_DEFINE = /^\{define:\s*([^}]+)\}$/i;
  var SHORT_MAP = {
    sov: { start: true, kind: "verse" },
    eov: { start: false, kind: "verse" },
    soc: { start: true, kind: "chorus" },
    eoc: { start: false, kind: "chorus" },
    sob: { start: true, kind: "bridge" },
    eob: { start: false, kind: "bridge" }
  };
  var RX_PLAIN_HEADER = /^(verse|chorus|bridge|intro|tag|outro)(?:\s+(\d+))?$/i;
  var RX_META = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}$/;
  var RX_CHORD = /\[([^\]]+)\]/g;
  function parseInline(line) {
    const chords = [];
    let plain = "";
    let last = 0;
    line.replace(RX_CHORD, (match, sym, offset) => {
      plain += line.slice(last, offset);
      chords.push({ sym, index: plain.length });
      last = offset + match.length;
      return match;
    });
    plain += line.slice(last);
    return { lyrics: plain, chords };
  }
  function isPlainHeader(line) {
    return RX_PLAIN_HEADER.test(line.trim());
  }
  function normalizePlainHeader(line) {
    const m = RX_PLAIN_HEADER.exec(line.trim());
    if (!m) return { kind: "verse", label: "" };
    const kind = m[1].toLowerCase();
    const label = m[2] ? `${capitalize(kind)} ${m[2]}` : capitalize(kind);
    return { kind, label };
  }
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  function parseInstrumentalDirective(body) {
    const chords = [];
    let repeat;
    const raw = (body || "").trim();
    if (!raw) return { chords, repeat };
    const repeatToken = (token) => {
      const trimmed = token.trim();
      if (!trimmed) return { chord: "", rep: void 0 };
      const directRepeat = trimmed.match(/^(.*?)(x\d+)$/i);
      if (directRepeat && directRepeat[1].trim()) {
        const chord = directRepeat[1].trim();
        const rep = parseInt(directRepeat[2].slice(1), 10);
        return { chord, rep: isNaN(rep) ? void 0 : rep };
      }
      return { chord: trimmed, rep: void 0 };
    };
    const assignRepeat = (token) => {
      if (/^x\d+$/i.test(token.trim())) {
        const rep = parseInt(token.trim().slice(1), 10);
        if (!Number.isNaN(rep)) repeat = rep;
        return true;
      }
      return false;
    };
    const pushPart = (part) => {
      if (!part) return;
      const { chord, rep } = repeatToken(part);
      if (chord) chords.push(chord);
      if (rep && !Number.isNaN(rep)) repeat = rep;
    };
    if (raw.includes(",")) {
      const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
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
  function parseDirective(raw) {
    const t = raw.trim();
    let m = RX_LONG_DIR.exec(t);
    if (m) {
      return {
        start: m[1].toLowerCase() === "start_of",
        kind: m[2].toLowerCase(),
        label: (m[3] || "").trim() || void 0
      };
    }
    m = RX_SHORT_DIR.exec(t);
    if (m) {
      const code = m[1].toLowerCase();
      const label = (m[2] || "").trim();
      const map = SHORT_MAP[code];
      if (map) return { start: map.start, kind: map.kind, label: map.start && label ? label : void 0 };
    }
    return null;
  }
  function parseChordProOrLegacy(input) {
    const lines = input.split(/\r?\n/);
    let hasEnv = false;
    for (const L of lines) {
      const t = L.trim();
      if (RX_LONG_DIR.test(t) || RX_SHORT_DIR.test(t)) {
        hasEnv = true;
        break;
      }
    }
    const doc = { meta: {}, sections: [], layoutHints: { columnBreakAfter: [] }, chordDefs: [] };
    let cur = null;
    const openSection = (kind, label) => {
      if (cur) doc.sections.push(cur);
      const lbl = label || capitalize(kind);
      return { kind, label: lbl, lines: [] };
    };
    const closeSection = () => {
      if (cur) {
        doc.sections.push(cur);
        cur = null;
      }
    };
    const insertStandaloneSection = (section) => {
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
      if (t.startsWith("#")) {
        continue;
      }
      if (t === "") {
        if (cur) cur.lines.push({ lyrics: "", chords: [] });
        continue;
      }
      let m;
      if (m = RX_CAPO.exec(t)) {
        doc.meta.capo = parseInt(m[1], 10);
        continue;
      }
      if (m = RX_COLUMNS.exec(t)) {
        const n = parseInt(m[1], 10);
        doc.layoutHints.requestedColumns = n === 2 ? 2 : 1;
        continue;
      }
      if (RX_COL_BREAK.test(t)) {
        doc.layoutHints.columnBreakAfter.push(doc.sections.length);
        continue;
      }
      if (m = RX_COMMENT.exec(t)) {
        const note = (m[2] || "").trim();
        if (!note) continue;
        const commentSection = {
          kind: "comment",
          label: "",
          lines: [{ lyrics: "", chords: [], comment: note }]
        };
        insertStandaloneSection(commentSection);
        continue;
      }
      if (m = RX_INSTRUMENTAL.exec(t)) {
        const spec = parseInstrumentalDirective(m[2] || "");
        const instLine = { lyrics: "", chords: [], instrumental: spec };
        const instSection = {
          kind: "instrumental",
          label: "Instrumental",
          lines: [instLine],
          instrumental: spec
        };
        insertStandaloneSection(instSection);
        continue;
      }
      if (m = RX_DEFINE.exec(t)) {
        const body = m[1].trim();
        const name = body.split(/\s+/)[0];
        doc.chordDefs.push({ name, raw: `define: ${body}` });
        continue;
      }
      const mMeta = RX_META.exec(t);
      if (mMeta && !RX_LONG_DIR.test(t) && !RX_SHORT_DIR.test(t)) {
        const key = mMeta[1].trim().toLowerCase();
        const val = mMeta[2].trim();
        if (key === "title") doc.meta.title = val;
        else if (key === "key") doc.meta.key = val;
        else if (key === "capo") doc.meta.capo = parseInt(val, 10);
        else if (key === "meta") {
          const [mk, ...rest] = val.split(/\s+/);
          if (mk) {
            if (!doc.meta.meta) doc.meta.meta = {};
            doc.meta.meta[mk.toLowerCase()] = rest.join(" ").trim();
          }
        } else {
          if (!doc.meta.meta) doc.meta.meta = {};
          doc.meta.meta[key] = val;
        }
        continue;
      }
      if (hasEnv) {
        const dir = parseDirective(t);
        if (dir) {
          dir.start ? cur = openSection(dir.kind, dir.label) : closeSection();
          continue;
        }
        if (t.startsWith("{") && t.endsWith("}")) continue;
        if (!cur) cur = openSection("verse", "Verse");
        cur.lines.push(parseInline(raw));
        continue;
      }
      if (isPlainHeader(raw)) {
        const { kind, label } = normalizePlainHeader(raw);
        cur = openSection(kind, label);
        continue;
      }
      if (t.startsWith("{") && t.endsWith("}")) {
        continue;
      }
      if (!cur) cur = openSection("verse", "Verse");
      cur.lines.push(parseInline(raw));
    }
    if (cur) closeSection();
    return doc;
  }

  // packages/core/src/chordpro/lint.ts
  var RX_CHORD_VALID = /^[A-G](?:#|b)?(?:(?:maj|min|m|dim|sus|add)?\d*)?(?:\/[A-G](?:#|b)?)?$/;
  function lintChordPro(rawOrDoc) {
    const doc = typeof rawOrDoc === "string" ? parseChordProOrLegacy(rawOrDoc) : rawOrDoc;
    const warnings = [];
    if (!doc.meta?.title || !doc.meta.title.trim()) {
      warnings.push({ code: "warn:missing_title", message: "Missing {title}." });
    }
    if (!doc.meta?.key || !doc.meta.key.trim()) {
      warnings.push({ code: "warn:missing_key", message: "Missing {key}." });
    }
    doc.sections.forEach((sec, si) => {
      const lyricLines = sec.lines.filter((ln) => !("comment" in ln));
      if (lyricLines.length === 0) {
        warnings.push({ code: "warn:empty_section", message: `Section "${sec.label || sec.kind}" has no lyric lines.`, sectionIndex: si });
      }
      lyricLines.forEach((ln, li) => {
        if ((ln.lyrics || "").length > 90) {
          warnings.push({ code: "warn:long_line", message: "Very long lyric line may force downsizing.", sectionIndex: si, lineIndex: li });
        }
        ;
        (ln.chords || []).forEach((ch) => {
          if (!RX_CHORD_VALID.test(ch.sym)) {
            warnings.push({ code: "warn:unknown_chord", message: `Suspicious chord "${ch.sym}".`, sectionIndex: si, lineIndex: li });
          }
        });
      });
    });
    for (let i = 1; i < doc.sections.length; i++) {
      const a = doc.sections[i - 1];
      const b = doc.sections[i];
      if ((a.label || a.kind) === (b.label || b.kind)) {
        const aLen = a.lines.filter((ln) => !("comment" in ln)).length;
        const bLen = b.lines.filter((ln) => !("comment" in ln)).length;
        if (aLen <= 2 && bLen <= 2) {
          warnings.push({ code: "warn:duplicate_section_header", message: `Adjacent duplicate "${a.label || a.kind}" with very few lines.`, sectionIndex: i });
        }
      }
    }
    if (typeof rawOrDoc === "string") {
      const lines = rawOrDoc.split(/\r?\n/);
      const stack = [];
      lines.forEach((raw, idx) => {
        const m = raw.trim().match(/^\{(start_of|end_of)_([^}:]+).*\}$/i);
        if (m) {
          const type = m[1].toLowerCase();
          const kind = m[2].toLowerCase();
          if (type === "start_of") {
            stack.push({ kind, lineIndex: idx });
          } else {
            const last = stack.pop();
            if (!last || last.kind !== kind) {
              warnings.push({ code: "warn:section_mismatch", message: `Stray {end_of_${kind}}`, lineIndex: idx });
            }
          }
        }
      });
      stack.forEach((st) => warnings.push({ code: "warn:section_mismatch", message: `Unclosed {start_of_${st.kind}}`, lineIndex: st.lineIndex }));
    }
    return warnings;
  }

  // packages/core/src/songs/instrumental.js
  function normalizeSpec(spec) {
    const chords = Array.isArray(spec?.chords) ? spec.chords.map((ch) => String(ch || "").trim()).filter(Boolean) : [];
    const repeat = typeof spec?.repeat === "number" && spec.repeat > 1 ? Math.floor(spec.repeat) : void 0;
    return { chords, repeat };
  }
  function transposeInstrumental(spec, steps = 0, preferFlat = false, opts = {}) {
    const style = opts.style || "letters";
    const { chords, repeat } = normalizeSpec(spec);
    const transposed = steps ? chords.map((sym) => transposeSymPrefer(sym, steps, preferFlat)) : chords.slice();
    const mapped = style === "solfege" ? transposed.map((sym) => formatChord(sym, { style })) : transposed;
    return { chords: mapped, repeat };
  }

  // packages/core/src/rbac/roles.js
  var ROLE_ORDER = ["user", "editor", "admin", "owner"];
  var ROLES_BY_RANK_DESC = [...ROLE_ORDER].reverse();
  function hasMinRole(userRole, minRole) {
    const userIdx = ROLE_ORDER.indexOf(userRole || "user");
    const minIdx = ROLE_ORDER.indexOf(minRole || "user");
    if (minIdx < 0) return false;
    return userIdx >= minIdx;
  }

  // packages/core/src/songs/slug.ts
  function slugify(title) {
    return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }

  // packages/core/src/chordpro/editing.ts
  function insertAtCursor(value, selection, text) {
    const { start, end } = selection;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = before + text + after;
    const pos = start + text.length;
    return { value: next, selection: { start: pos, end: pos } };
  }
  function wrapSection(value, selection, { directive, label }) {
    const { start, end } = selection;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const startDir = `{start_of_${directive}: ${label}}`;
    const endDir = `{end_of_${directive}}`;
    if (selected) {
      const insertion2 = `${startDir}
${selected}
${endDir}
`;
      const next2 = before + insertion2 + after;
      return { value: next2, selection: { start, end: start + insertion2.length } };
    }
    const insertion = `${startDir}

${endDir}
`;
    const next = before + insertion + after;
    const pos = start + startDir.length + 1;
    return { value: next, selection: { start: pos, end: pos } };
  }
  var CHORD_VARIANTS = ["7", "maj7", "sus2", "sus4"];
  function chordInsertToken(symbol) {
    return `[${symbol}]`;
  }
  var SECTION_PRESETS = [
    { label: "Verse", directive: "verse", sectionLabel: "Verse" },
    { label: "Chorus", directive: "chorus", sectionLabel: "Chorus" },
    { label: "Bridge", directive: "bridge", sectionLabel: "Bridge" },
    { label: "Pre-Chorus", directive: "chorus", sectionLabel: "Pre-Chorus" },
    { label: "Intro", directive: "intro", sectionLabel: "Intro" },
    { label: "Outro", directive: "outro", sectionLabel: "Outro" },
    { label: "Tag", directive: "tag", sectionLabel: "Tag" },
    { label: "Interlude", directive: "chorus", sectionLabel: "Interlude" }
  ];

  // packages/core/src/chordpro/diatonicChords.js
  var MAJOR_DIATONIC = {
    "C": [["C", "I", "C"], ["Dm", "ii", "Dm"], ["Em", "iii", "Em"], ["F", "IV", "F"], ["G", "V", "G"], ["Am", "vi", "Am"], ["Bdim", "vii\xB0", "Bdim"]],
    "Db": [["Db", "I", "Db"], ["Ebm", "ii", "Ebm"], ["Fm", "iii", "Fm"], ["Gb", "IV", "Gb"], ["Ab", "V", "Ab"], ["Bbm", "vi", "Bbm"], ["Cdim", "vii\xB0", "Cdim"]],
    "D": [["D", "I", "D"], ["Em", "ii", "Em"], ["F#m", "iii", "F#m"], ["G", "IV", "G"], ["A", "V", "A"], ["Bm", "vi", "Bm"], ["C#dim", "vii\xB0", "C#dim"]],
    "Eb": [["Eb", "I", "Eb"], ["Fm", "ii", "Fm"], ["Gm", "iii", "Gm"], ["Ab", "IV", "Ab"], ["Bb", "V", "Bb"], ["Cm", "vi", "Cm"], ["Ddim", "vii\xB0", "Ddim"]],
    "E": [["E", "I", "E"], ["F#m", "ii", "F#m"], ["G#m", "iii", "G#m"], ["A", "IV", "A"], ["B", "V", "B"], ["C#m", "vi", "C#m"], ["D#dim", "vii\xB0", "D#dim"]],
    "F": [["F", "I", "F"], ["Gm", "ii", "Gm"], ["Am", "iii", "Am"], ["Bb", "IV", "Bb"], ["C", "V", "C"], ["Dm", "vi", "Dm"], ["Edim", "vii\xB0", "Edim"]],
    "F#": [["F#", "I", "F#"], ["G#m", "ii", "G#m"], ["A#m", "iii", "A#m"], ["B", "IV", "B"], ["C#", "V", "C#"], ["D#m", "vi", "D#m"], ["E#dim", "vii\xB0", "Fdim"]],
    "G": [["G", "I", "G"], ["Am", "ii", "Am"], ["Bm", "iii", "Bm"], ["C", "IV", "C"], ["D", "V", "D"], ["Em", "vi", "Em"], ["F#dim", "vii\xB0", "F#dim"]],
    "Ab": [["Ab", "I", "Ab"], ["Bbm", "ii", "Bbm"], ["Cm", "iii", "Cm"], ["Db", "IV", "Db"], ["Eb", "V", "Eb"], ["Fm", "vi", "Fm"], ["Gdim", "vii\xB0", "Gdim"]],
    "A": [["A", "I", "A"], ["Bm", "ii", "Bm"], ["C#m", "iii", "C#m"], ["D", "IV", "D"], ["E", "V", "E"], ["F#m", "vi", "F#m"], ["G#dim", "vii\xB0", "G#dim"]],
    "Bb": [["Bb", "I", "Bb"], ["Cm", "ii", "Cm"], ["Dm", "iii", "Dm"], ["Eb", "IV", "Eb"], ["F", "V", "F"], ["Gm", "vi", "Gm"], ["Adim", "vii\xB0", "Adim"]],
    "B": [["B", "I", "B"], ["C#m", "ii", "C#m"], ["D#m", "iii", "D#m"], ["E", "IV", "E"], ["F#", "V", "F#"], ["G#m", "vi", "G#m"], ["A#dim", "vii\xB0", "A#dim"]]
  };
  var MINOR_TO_RELATIVE_MAJOR = {
    "Am": { major: "C", offset: 5 },
    "Bbm": { major: "Db", offset: 5 },
    "Bm": { major: "D", offset: 5 },
    "Cm": { major: "Eb", offset: 5 },
    "C#m": { major: "E", offset: 5 },
    "Dm": { major: "F", offset: 5 },
    "Ebm": { major: "Gb", offset: 5 },
    "D#m": { major: "Gb", offset: 5 },
    "Em": { major: "G", offset: 5 },
    "Fm": { major: "Ab", offset: 5 },
    "F#m": { major: "A", offset: 5 },
    "Gm": { major: "Bb", offset: 5 },
    "G#m": { major: "B", offset: 5 },
    "Abm": { major: "B", offset: 5 }
  };
  var MINOR_DEGREES = ["i", "ii\xB0", "III", "iv", "v", "VI", "VII"];
  function getDiatonicChords(key) {
    if (!key) return null;
    const isMinor = key.endsWith("m") && key.length > 1;
    if (isMinor) {
      const rel = MINOR_TO_RELATIVE_MAJOR[key];
      if (!rel) return null;
      const majorChords = MAJOR_DIATONIC[rel.major];
      if (!majorChords) return null;
      const rotated = [];
      for (let i = 0; i < 7; i++) {
        const srcIndex = (5 + i) % 7;
        const [symbol, , display] = majorChords[srcIndex];
        rotated.push({ degree: MINOR_DEGREES[i], symbol, display });
      }
      return rotated;
    }
    const lookupKey = key === "Gb" ? "F#" : key;
    const chords = MAJOR_DIATONIC[lookupKey];
    if (!chords) return null;
    return chords.map(([symbol, degree, display]) => ({ degree, symbol, display }));
  }

  // packages/core/src/songs/pdfImport.ts
  var TOKEN_PATTERNS = [
    "maj",
    "min",
    "m",
    "dim",
    "aug",
    "sus2",
    "sus4",
    "sus",
    "add13",
    "add11",
    "add9",
    "add",
    "13",
    "11",
    "9",
    "7",
    "6",
    "5",
    "4",
    "2"
  ];
  var RX_NOISE = /^(\|{1,2}|:\|{1,2}|\|{1,2}:|%|x\d+|\(x\d+\)|\/+|-+|\.+)$/i;
  function normalizeAccidentals(input) {
    return input.replace(/[♯＃]/g, "#").replace(/[♭]/g, "b");
  }
  function normalizeChordToken(input) {
    const trimmed = normalizeAccidentals(input.trim());
    if (!trimmed) return "";
    const upper = trimmed.toUpperCase();
    if (upper === "N.C." || upper === "NC" || upper === "N.C") return "N.C.";
    const match = trimmed.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!match) return trimmed;
    const root = match[1].toUpperCase() + match[2];
    let rest = match[3];
    let bass = "";
    const slashIndex = rest.indexOf("/");
    if (slashIndex !== -1) {
      bass = rest.slice(slashIndex + 1);
      rest = rest.slice(0, slashIndex);
    }
    let normalizedBass = "";
    if (bass) {
      const bassMatch = normalizeAccidentals(bass).match(/^([A-Ga-g])([#b]?)$/);
      normalizedBass = bassMatch ? `/${bassMatch[1].toUpperCase()}${bassMatch[2]}` : `/${bass}`;
    }
    return `${root}${rest.toLowerCase()}${normalizedBass}`;
  }
  function isChordToken(input) {
    const trimmed = normalizeAccidentals(input.trim());
    if (!trimmed) return false;
    const upper = trimmed.toUpperCase();
    if (upper === "N.C." || upper === "NC" || upper === "N.C") return true;
    const match = trimmed.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!match) return false;
    let rest = match[3];
    if (!rest) return true;
    const slashIndex = rest.indexOf("/");
    if (slashIndex !== -1) {
      const bass = rest.slice(slashIndex + 1);
      if (!/^[A-Ga-g][#b]?$/.test(bass)) return false;
      rest = rest.slice(0, slashIndex);
    }
    let remaining = rest.toLowerCase();
    while (remaining.length > 0) {
      const token = TOKEN_PATTERNS.find((pattern) => remaining.startsWith(pattern));
      if (!token) return false;
      remaining = remaining.slice(token.length);
    }
    return true;
  }
  function isChordLineNoise(input) {
    return RX_NOISE.test(input.trim());
  }
  function extractChordTokens(line) {
    const tokens = [];
    const regex = /\S+/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (isChordToken(match[0])) {
        tokens.push({ token: normalizeChordToken(match[0]), index: match.index });
      }
    }
    return tokens;
  }
  var RX_HEADING = /^[[(]?\s*(verse|chorus|pre[-\s]?chorus|bridge|intro|outro|tag|interlude|refrain|ending)(?:\s+(\d+))?\s*[.:]?\s*[\])]?(?:\s*\([^)]{1,12}\))*\s*$/i;
  function classifyLine(text, hints = {}) {
    const trimmed = text.trim();
    if (!trimmed) return "blank";
    if (RX_HEADING.test(trimmed)) return "heading";
    const tokens = trimmed.split(/\s+/);
    let chordCount = 0;
    let noiseCount = 0;
    let wordishCount = 0;
    for (const token of tokens) {
      if (isChordLineNoise(token)) {
        noiseCount += 1;
        continue;
      }
      if (isChordToken(token)) {
        chordCount += 1;
        continue;
      }
      if (/[a-zA-Z]/.test(token)) wordishCount += 1;
    }
    const effective = tokens.length - noiseCount;
    if (effective === 0 && noiseCount > 0) return "chords";
    if (chordCount === 0) return "lyrics";
    const chordRatio = chordCount / Math.max(1, effective);
    if (chordRatio >= 0.6 && wordishCount <= 2) return "chords";
    const emphasised = hints.isBold === true || hints.fontSize != null && hints.pageFontSize != null && hints.fontSize < hints.pageFontSize * 0.95;
    if (emphasised && chordRatio >= 0.4 && wordishCount <= 2) return "chords";
    return "lyrics";
  }
  var HEADING_PRESET = {
    verse: "Verse",
    chorus: "Chorus",
    "pre-chorus": "Pre-Chorus",
    prechorus: "Pre-Chorus",
    "pre chorus": "Pre-Chorus",
    bridge: "Bridge",
    intro: "Intro",
    outro: "Outro",
    ending: "Outro",
    tag: "Tag",
    interlude: "Interlude",
    refrain: "Chorus"
  };
  function headingToDirective(heading) {
    const match = RX_HEADING.exec(heading.trim());
    if (!match) return null;
    const presetLabel = HEADING_PRESET[match[1].toLowerCase().replace(/\s+/g, "-")];
    const preset = SECTION_PRESETS.find((p) => p.label === presetLabel);
    if (!preset) return null;
    const number = match[2];
    return {
      directive: preset.directive,
      label: number ? `${preset.sectionLabel} ${number}` : preset.sectionLabel
    };
  }
  var KEY_BODY = String.raw`([A-G][b#♭♯]?\s*(?:m|min|minor|maj|major)?)`;
  var RX_KEY_PAREN = new RegExp(String.raw`^\(\s*key\s*(?:of\b|:|-)?\s*${KEY_BODY}\s*\)$`, "i");
  var RX_KEY_BARE = new RegExp(String.raw`^key\s*(?:of\b|:|-|—)?\s*${KEY_BODY}\s*$`, "i");
  var RX_URL = /(https?:\/\/|www\.)\S+/i;
  var RX_DOMAIN = /\b[a-z0-9-]+\.(com|org|net|church|co|io|us|info|ca|uk|gov|edu)\b/i;
  var RX_EMAIL = /\b\S+@\S+\.[A-Za-z]{2,}\b/;
  var RX_PAGE = /^\s*page\s*\d+(\s*of\s*\d+)?\s*$/i;
  var RX_COPYRIGHT = /(©|\(c\)\s*\d{4}|copyright|all rights reserved|ccli)/i;
  var RX_DISCLAIMER = /property of their respective owners|personal worship and educational use/i;
  function isPageFurniture(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    return RX_URL.test(trimmed) || RX_DOMAIN.test(trimmed) || RX_EMAIL.test(trimmed) || RX_PAGE.test(trimmed) || RX_COPYRIGHT.test(trimmed) || RX_DISCLAIMER.test(trimmed);
  }
  function parseKeyLine(text) {
    const trimmed = text.trim();
    const match = RX_KEY_PAREN.exec(trimmed) || RX_KEY_BARE.exec(trimmed);
    if (!match) return void 0;
    const parts = /^([A-Ga-g])([#b]?)\s*(.*)$/.exec(normalizeAccidentals(match[1]));
    if (!parts) return void 0;
    const root = parts[1].toUpperCase() + parts[2].toLowerCase();
    return /^m(in|inor)?$/i.test(parts[3]) ? `${root}m` : root;
  }
  function isLikelyAuthorLine(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (parseKeyLine(trimmed)) return false;
    if (/[{}]/.test(trimmed)) return false;
    if (/[0-9]/.test(trimmed)) return false;
    if (classifyLine(trimmed) !== "lyrics") return false;
    const words = trimmed.replace(/^(words?|music|by|and)\s+/i, "").split(/\s+/).filter((w) => !/^[/&,·|-]+$/.test(w));
    if (words.length < 2 || words.length > 12) return false;
    return words.filter((w) => /^[A-Z]/.test(w)).length >= 2;
  }
  var RX_KEY_ANYWHERE = /\bkey\s*[:\-–]\s*([A-G][b#♭♯]?\s*(?:m|min|minor|maj|major)?)(?![a-z])/i;
  var RX_TEMPO_ANYWHERE = /\btempo\s*[:\-–]\s*(\d{2,3})\b/i;
  var RX_TIME_ANYWHERE = /\btime\s*(?:sig(?:nature)?)?\s*[:\-–]?\s*(\d{1,2}\s*\/\s*\d{1,2})/i;
  function extractMetadataHints(lines, headerBottom) {
    const hints = { consumed: /* @__PURE__ */ new Set() };
    for (const line of lines) {
      if (line.page !== 0 || line.y > headerBottom) continue;
      if (!line.text.trim()) continue;
      let took = false;
      if (!hints.key) {
        const match = RX_KEY_ANYWHERE.exec(line.text);
        if (match) {
          hints.key = normalizeKey(match[1]);
          took = true;
        }
      }
      if (!hints.tempo) {
        const match = RX_TEMPO_ANYWHERE.exec(line.text);
        if (match) {
          hints.tempo = match[1];
          took = true;
        }
      }
      if (!hints.timeSignature) {
        const match = RX_TIME_ANYWHERE.exec(line.text);
        if (match) {
          hints.timeSignature = match[1].replace(/\s+/g, "");
          took = true;
        }
      }
      if (took) hints.consumed.add(line.text);
    }
    return hints;
  }
  function normalizeKey(raw) {
    const parts = /^([A-Ga-g])([#b]?)\s*(.*)$/.exec(normalizeAccidentals(raw.trim()));
    if (!parts) return void 0;
    const root = parts[1].toUpperCase() + parts[2].toLowerCase();
    return /^m(in|inor)?$/i.test(parts[3]) ? `${root}m` : root;
  }
  function extractHeader(lines, pageFontSize2) {
    const consumed = /* @__PURE__ */ new Set();
    const candidates = [];
    for (let i = 0; i < lines.length && candidates.length < 6; i += 1) {
      const line = lines[i];
      if (line.page !== 0) break;
      if (!line.text.trim()) continue;
      candidates.push(i);
    }
    if (candidates.length === 0) return { consumed };
    let title;
    let titleIndex = -1;
    const eligible = candidates.filter((i) => {
      const text = lines[i].text.trim();
      if (isPageFurniture(text)) return false;
      if (parseKeyLine(text)) return false;
      if (text.length > 80 || text.includes("{") || text.includes("}")) return false;
      return classifyLine(text) !== "chords";
    });
    const oversized = eligible.filter(
      (i) => pageFontSize2 != null && (lines[i].fontSize ?? 0) > pageFontSize2 * 1.25
    );
    const spanning = (oversized.length ? oversized : eligible).filter((i) => lines[i].column == null);
    const pool = spanning.length ? spanning : oversized.length ? oversized : eligible;
    if (pool.length) {
      titleIndex = pool.reduce((best, i) => (lines[i].fontSize ?? 0) > (lines[best].fontSize ?? 0) ? i : best, pool[0]);
      title = lines[titleIndex].text.trim();
      consumed.add(titleIndex);
    }
    let key;
    let artist;
    for (const i of candidates) {
      if (i === titleIndex) continue;
      const text = lines[i].text.trim();
      if (!key) {
        const parsed = parseKeyLine(text);
        if (parsed) {
          key = parsed;
          consumed.add(i);
          continue;
        }
      }
      if (!artist && i > titleIndex && isLikelyAuthorLine(text)) {
        artist = text.replace(/^(words?\s+(and|&)\s+music\s+by|by)\s+/i, "").trim();
        consumed.add(i);
      }
    }
    return { title, key, artist, consumed };
  }
  function modeOf(values, binSize = 0.5) {
    if (values.length === 0) return null;
    const bins = /* @__PURE__ */ new Map();
    for (const v of values) {
      const bin = Math.round(v / binSize);
      const bucket = bins.get(bin);
      if (bucket) bucket.push(v);
      else bins.set(bin, [v]);
    }
    let best = [];
    for (const bucket of bins.values()) {
      if (bucket.length > best.length) best = bucket;
    }
    if (best.length === 0) return null;
    return best.reduce((a, b) => a + b, 0) / best.length;
  }
  function pageFontSize(lines) {
    const sizes = lines.map((l) => l.fontSize).filter((s) => s != null && s > 0);
    const mode = modeOf(sizes, 0.5);
    return mode ?? void 0;
  }
  function bodyLeading(items) {
    const wide = [];
    const all = [];
    for (let i = 1; i < items.length; i += 1) {
      const prev = items[i - 1];
      const cur = items[i];
      if (cur.line.startsBlock) continue;
      if (cur.line.page !== prev.line.page) continue;
      if ((cur.line.column ?? null) !== (prev.line.column ?? null)) continue;
      const pitch = cur.line.y - prev.line.y;
      if (!(pitch > 0)) continue;
      all.push(pitch);
      if (prev.kind !== "chords") wide.push(pitch);
    }
    if (wide.length >= 4) return modeOf(wide);
    return modeOf(all);
  }
  var RX_WORD = /[A-Za-z0-9'’]+/g;
  function wordSpans(line) {
    const spans = [];
    let match;
    RX_WORD.lastIndex = 0;
    while ((match = RX_WORD.exec(line)) !== null) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
    return spans;
  }
  function isWordChar(char) {
    return /[A-Za-z0-9'’]/.test(char);
  }
  var MID_WORD_MINIMUM_LENGTH = 5;
  function midWordAllowed(line, offset, span) {
    const length = span.end - span.start;
    if (length < MID_WORD_MINIMUM_LENGTH) return false;
    if (offset - span.start < 2) return false;
    if (span.end - offset < 2) return false;
    if (span.start > 0 && line[span.start - 1] === "-") return false;
    if (span.end < line.length && line[span.end] === "-") return false;
    if (line[offset] === "-" || line[offset - 1] === "-") return false;
    return true;
  }
  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function chordOnlyLine(line) {
    const chordWords = line.words.filter((w) => isChordToken(w.text)).slice().sort((a, b) => a.x - b.x);
    if (chordWords.length === 0) {
      const tokens = extractChordTokens(line.text);
      return { text: tokens.map((t) => `[${t.token}]`).join(" "), count: tokens.length };
    }
    const advances = line.words.filter((w) => w.w > 0 && w.text.length > 0).map((w) => w.w / w.text.length);
    const charWidth = advances.length ? median(advances) : 0;
    const left = chordWords[0].x;
    let out = "";
    let column = 0;
    for (const word of chordWords) {
      const target = charWidth > 0 ? Math.round((word.x - left) / charWidth) : column;
      const pad = out === "" ? Math.max(0, target) : Math.max(1, target - column);
      out += " ".repeat(pad) + `[${normalizeChordToken(word.text)}]`;
      column += pad;
    }
    return { text: out, count: chordWords.length };
  }
  function alignChordWordsToLyrics(chordLine, lyricLine) {
    const text = lyricLine.text;
    const lyricWords = lyricLine.words.filter((w) => w.end > w.start && w.end <= text.length);
    const chordWords = chordLine.words.filter((w) => isChordToken(w.text)).slice().sort((a, b) => a.x - b.x);
    if (chordWords.length === 0) return { line: text, inserted: 0, suspiciousInsertions: 0 };
    if (lyricWords.length === 0) return alignChordLineToLyrics(chordLine.text, text);
    const insertions = [];
    let suspicious = 0;
    let lastIndex = 0;
    let lastOffset = -1;
    for (const chord of chordWords) {
      const center = chord.x + chord.w / 2;
      let index = lyricWords.findIndex((w) => center >= w.x && center <= w.x + w.w);
      if (index === -1) {
        index = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < lyricWords.length; i += 1) {
          const w = lyricWords[i];
          const distance = Math.abs(center - (w.x + w.w / 2));
          if (distance < bestDistance) {
            bestDistance = distance;
            index = i;
          }
        }
      }
      if (index < lastIndex) index = lastIndex;
      lastIndex = index;
      const word = lyricWords[index];
      let offset = word.start;
      const wantsMidWord = word.w > 0 && center > word.x + word.w * 0.25;
      if (wantsMidWord) {
        const charX = word.charX;
        let placed = false;
        if (charX && charX.length === word.end - word.start) {
          let bestK = -1;
          let bestDistance = Number.POSITIVE_INFINITY;
          for (let k = 1; k < charX.length; k += 1) {
            const distance = Math.abs(center - charX[k]);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestK = k;
            }
          }
          if (bestK > 0) {
            const candidate = word.start + bestK;
            if (midWordAllowed(text, candidate, { start: word.start, end: word.end })) {
              offset = candidate;
              placed = true;
            }
          }
        }
        if (!placed && word.end - word.start >= MID_WORD_MINIMUM_LENGTH) suspicious += 1;
      }
      if (offset <= lastOffset) {
        const next = lyricWords.find((w) => w.start > lastOffset);
        offset = next ? next.start : text.length;
      }
      lastOffset = offset;
      insertions.push({ offset: Math.max(0, Math.min(offset, text.length)), token: normalizeChordToken(chord.text) });
    }
    return { line: applyInsertions(text, insertions), inserted: insertions.length, suspiciousInsertions: suspicious };
  }
  function applyInsertions(text, insertions) {
    let out = "";
    let cursor = 0;
    for (const insertion of insertions) {
      out += text.slice(cursor, insertion.offset) + `[${insertion.token}]`;
      cursor = insertion.offset;
    }
    return out + text.slice(cursor);
  }
  function alignChordLineToLyrics(chordLine, lyricLine) {
    const chords = extractChordTokens(chordLine);
    if (chords.length === 0 || lyricLine.trim().length === 0) {
      return { line: lyricLine, inserted: 0, suspiciousInsertions: 0 };
    }
    const spans = wordSpans(lyricLine);
    const insertions = [];
    let suspicious = 0;
    let lastOffset = -1;
    for (const chord of chords) {
      const target = Math.round(chord.index / Math.max(1, chordLine.length) * lyricLine.length);
      const clamped = Math.max(0, Math.min(target, lyricLine.length));
      const isMidWord = clamped > 0 && clamped < lyricLine.length && isWordChar(lyricLine[clamped - 1]) && isWordChar(lyricLine[clamped]);
      let offset = clamped;
      if (isMidWord) {
        const span = spans.find((s) => clamped > s.start && clamped < s.end);
        if (!span || !midWordAllowed(lyricLine, clamped, span)) {
          offset = span ? span.start : clamped;
          suspicious += 1;
        }
      } else if (spans.length) {
        const next = spans.find((s) => s.start >= clamped);
        const prev = [...spans].reverse().find((s) => s.start <= clamped);
        offset = next && prev ? clamped - prev.start <= next.start - clamped ? prev.start : next.start : (next ?? prev ?? { start: clamped }).start;
      }
      if (offset <= lastOffset) {
        const next = spans.find((s) => s.start > lastOffset);
        offset = next ? next.start : lyricLine.length;
      }
      lastOffset = offset;
      insertions.push({ offset: Math.max(0, Math.min(offset, lyricLine.length)), token: chord.token });
    }
    return { line: applyInsertions(lyricLine, insertions), inserted: insertions.length, suspiciousInsertions: suspicious };
  }
  function xOverlapRatio(a, b) {
    if (!(a.w > 0)) return 0;
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.w, b.x + b.w);
    return Math.max(0, right - left) / a.w;
  }
  function buildSongDraft(doc) {
    const warnings = [];
    const pages = new Map(doc.pages.map((p) => [p.index, p]));
    const firstPageHeight = doc.pages.find((p) => p.index === 0)?.height ?? 792;
    const hints = extractMetadataHints(
      doc.lines.filter((l) => l.text.trim().length > 0),
      firstPageHeight * 0.18
    );
    const usable = doc.lines.filter(
      (l) => l.text.trim().length > 0 && !isPageFurniture(l.text) && !hints.consumed.has(l.text)
    );
    const modalSize = pageFontSize(usable);
    const header = extractHeader(usable, modalSize);
    const items = usable.map((line, index) => ({ line, index })).filter(({ index }) => !header.consumed.has(index)).map(({ line }) => ({
      line,
      kind: classifyLine(line.text, {
        isBold: line.isBold,
        fontSize: line.fontSize,
        pageFontSize: modalSize
      }),
      blanksBefore: 0
    }));
    const leading = bodyLeading(items);
    for (let i2 = 1; i2 < items.length; i2 += 1) {
      const prev = items[i2 - 1].line;
      const cur = items[i2].line;
      if (cur.startsBlock || cur.page !== prev.page || (cur.column ?? null) !== (prev.column ?? null)) continue;
      const pitch = cur.y - prev.y;
      if (!(pitch > 0)) continue;
      if (leading && leading > 0) {
        items[i2].blanksBefore = Math.max(0, Math.round(pitch / leading) - 1);
      } else {
        const scale = Math.max(prev.fontSize ?? 0, cur.fontSize ?? 0, 1);
        items[i2].blanksBefore = pitch > scale * 1.8 ? 1 : 0;
      }
    }
    const rows = [];
    let chordCount = 0;
    let lyricLineCount = 0;
    let suspicious = 0;
    let unpaired = 0;
    let chordLineCount = 0;
    let pairedChordLines = 0;
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      const breakBefore = item.blanksBefore > 0;
      if (item.kind === "heading") {
        const directive = headingToDirective(item.line.text);
        if (directive) {
          rows.push({ kind: "heading", ...directive, breakBefore, line: item.line });
          i += 1;
          continue;
        }
        rows.push({ kind: "body", text: item.line.text.trim(), breakBefore, line: item.line });
        i += 1;
        continue;
      }
      if (item.kind === "chords") {
        chordLineCount += 1;
        const next = items[i + 1];
        const page = pages.get(item.line.page);
        const pairable = next != null && next.kind === "lyrics" && page?.layoutTrusted !== false && next.line.page === item.line.page && (next.line.column ?? null) === (item.line.column ?? null) && !next.line.startsBlock && next.blanksBefore === 0 && xOverlapRatio(item.line, next.line) >= 0.5 && (leading == null || next.line.y - item.line.y <= leading * 1.15) && // A chord line with far more chords than the lyric line has words is an
        // instrumental run that happens to sit above something short, not a pair.
        // Forcing the match piled four of seven chords onto the last character of a
        // five-character line on a real chart; refusing keeps the run on its own line
        // with its spacing intact, which is what it is.
        item.line.words.filter((w) => isChordToken(w.text)).length <= Math.max(2, next.line.words.length + 1);
        if (pairable && next) {
          const aligned = alignChordWordsToLyrics(item.line, next.line);
          rows.push({ kind: "body", text: aligned.line, breakBefore, line: item.line });
          chordCount += aligned.inserted;
          suspicious += aligned.suspiciousInsertions;
          lyricLineCount += 1;
          pairedChordLines += 1;
          i += 2;
          continue;
        }
        const only = chordOnlyLine(item.line);
        if (only.count > 0) {
          rows.push({ kind: "body", text: only.text, breakBefore, line: item.line });
          chordCount += only.count;
          unpaired += 1;
        }
        i += 1;
        continue;
      }
      rows.push({ kind: "body", text: item.line.text.trim(), breakBefore, line: item.line });
      lyricLineCount += 1;
      i += 1;
    }
    const boundaries = [];
    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      if (!row.line.startsBlock || row.kind === "heading") continue;
      const prev = rows[r - 1].line;
      boundaries.push(
        row.line.page !== prev.page ? `the top of page ${row.line.page + 1}` : `the second column of page ${row.line.page + 1}`
      );
    }
    const hasHeadings = rows.some((r) => r.kind === "heading");
    let { chordpro, sections } = serialize(rows, hasHeadings);
    try {
      parseChordProOrLegacy(chordpro);
    } catch {
      const plain = serialize(rows, false);
      chordpro = plain.chordpro;
      sections = 0;
      warnings.push({
        code: "no_sections",
        message: "Section markers could not be generated \u2014 the lyrics were imported without them."
      });
    }
    if (!header.title) warnings.push({ code: "no_title", message: "No title found \u2014 add one before saving." });
    const key = header.key ?? hints.key;
    if (!key) warnings.push({ code: "no_key", message: "No key found \u2014 set it before publishing." });
    if (!hasHeadings) {
      warnings.push({ code: "no_sections", message: "No section headings found \u2014 add them with the toolbar." });
    }
    if (chordCount === 0) {
      warnings.push({ code: "no_chords", message: "No chords were recognised." });
    }
    if (unpaired > 0) {
      warnings.push({
        code: "unpaired_chords",
        message: `${unpaired} chord ${unpaired === 1 ? "line" : "lines"} could not be matched to lyrics and were left on their own.`
      });
    }
    if (suspicious > 0) {
      warnings.push({
        code: "suspicious_placement",
        message: `${suspicious} ${suspicious === 1 ? "chord" : "chords"} placed at the start of a word rather than mid-word.`
      });
    }
    for (const boundary of boundaries) {
      warnings.push({ code: "boundary_break", message: `A section break at ${boundary} may be missing.` });
    }
    if (doc.pages.some((p) => p.columnCount > 1)) {
      warnings.push({ code: "two_column", message: "Two-column layout \u2014 check the chord placement." });
    }
    for (const page of doc.pages.filter((p) => !p.layoutTrusted)) {
      warnings.push({
        code: "layout_untrusted",
        message: `Page ${page.index + 1}'s layout could not be read \u2014 its chords were left on their own lines.`
      });
    }
    for (const diagnostic of doc.diagnostics ?? []) {
      warnings.push({ code: "extractor", message: diagnostic });
    }
    const mappingRate = chordLineCount > 0 ? pairedChordLines / chordLineCount : 1;
    let confidence = 100;
    if (lyricLineCount === 0) confidence -= 30;
    if (chordCount === 0) confidence -= 15;
    if (mappingRate < 0.6) confidence -= 20;
    if (suspicious > 5) confidence -= 10;
    if (unpaired > 2) confidence -= 10;
    if (!hasHeadings) confidence -= 15;
    if (!header.title) confidence -= 10;
    if (!key) confidence -= 5;
    if (doc.pages.some((p) => !p.layoutTrusted)) confidence -= 15;
    confidence -= Math.min(20, (doc.diagnostics?.length ?? 0) * 5);
    return {
      title: header.title,
      key,
      tempo: hints.tempo,
      timeSignature: hints.timeSignature,
      artist: header.artist,
      chordpro,
      confidence: Math.max(0, Math.min(100, confidence)),
      warnings,
      stats: {
        sections,
        chords: chordCount,
        lyricLines: lyricLineCount,
        suspiciousInsertions: suspicious,
        unpairedChordLines: unpaired
      }
    };
  }
  function serialize(rows, hasHeadings) {
    if (!hasHeadings) {
      const out2 = [];
      for (const row of rows) {
        if (row.kind !== "body") continue;
        if (row.breakBefore && out2.length) out2.push("");
        out2.push(row.text);
      }
      return { chordpro: out2.join("\n").trim(), sections: 0 };
    }
    const blocks = [];
    let current = null;
    let sawHeading = false;
    for (const row of rows) {
      if (row.kind === "heading") {
        current = { directive: row.directive, label: row.label, lines: [] };
        blocks.push(current);
        sawHeading = true;
        continue;
      }
      if (!current || row.breakBefore && !sawHeading) {
        current = { lines: [] };
        blocks.push(current);
      } else if (row.breakBefore && current.lines.length) {
        current.lines.push("");
      }
      current.lines.push(row.text);
    }
    let verseNumber = 0;
    const used = /* @__PURE__ */ new Set();
    for (const block of blocks) {
      if (block.label) used.add(block.label);
    }
    const out = [];
    let sections = 0;
    for (const block of blocks) {
      if (block.lines.length === 0) continue;
      let directive = block.directive;
      let label = block.label;
      if (!directive) {
        directive = "verse";
        do {
          verseNumber += 1;
          label = `Verse ${verseNumber}`;
        } while (used.has(label));
        used.add(label);
      } else if (directive === "verse" && label === "Verse") {
        do {
          verseNumber += 1;
          label = `Verse ${verseNumber}`;
        } while (used.has(label));
        used.add(label);
      }
      if (out.length) out.push("");
      out.push(`{start_of_${directive}: ${label}}`);
      out.push(...block.lines);
      out.push(`{end_of_${directive}}`);
      sections += 1;
    }
    return { chordpro: out.join("\n").trim(), sections };
  }

  // apps/studio/js/entry.mjs
  var STYLES = ["letters", "solfege"];
  function transpose(sym, steps, preferFlat = false) {
    if (typeof sym !== "string" || sym.length === 0) {
      throw new TypeError(`transpose: sym must be a non-empty string, got ${describe(sym)}`);
    }
    if (typeof steps !== "number" || !Number.isInteger(steps)) {
      throw new TypeError(`transpose: steps must be an integer, got ${describe(steps)}`);
    }
    if (typeof preferFlat !== "boolean") {
      throw new TypeError(`transpose: preferFlat must be a boolean, got ${describe(preferFlat)}`);
    }
    return transposeSymPrefer(sym, steps, preferFlat);
  }
  function parseToJSON(chordpro) {
    if (typeof chordpro !== "string") {
      throw new TypeError(`parseToJSON: chordpro must be a string, got ${describe(chordpro)}`);
    }
    return JSON.stringify(parseChordProOrLegacy(chordpro));
  }
  function stepsBetween2(fromKey, toKey) {
    requireString("stepsBetween", "fromKey", fromKey);
    requireString("stepsBetween", "toKey", toKey);
    return stepsBetween(fromKey, toKey);
  }
  function formatKey(key, style) {
    requireString("formatKey", "key", key);
    requireStyle("formatKey", style);
    return formatKeyDisplay(key, style);
  }
  function renderToJSON(chordpro, steps, preferFlat, style) {
    if (typeof chordpro !== "string") {
      throw new TypeError(`renderToJSON: chordpro must be a string, got ${describe(chordpro)}`);
    }
    if (typeof steps !== "number" || !Number.isInteger(steps)) {
      throw new TypeError(`renderToJSON: steps must be an integer, got ${describe(steps)}`);
    }
    if (typeof preferFlat !== "boolean") {
      throw new TypeError(`renderToJSON: preferFlat must be a boolean, got ${describe(preferFlat)}`);
    }
    requireStyle("renderToJSON", style);
    const doc = parseChordProOrLegacy(chordpro);
    for (const section of doc.sections ?? []) {
      if (section.instrumental) {
        section.instrumental = transposeInstrumental(section.instrumental, steps, preferFlat, { style });
      }
      for (const line of section.lines ?? []) {
        if (line.instrumental) {
          line.instrumental = transposeInstrumental(line.instrumental, steps, preferFlat, { style });
        }
        if (line.chords?.length) {
          line.chords = line.chords.map((chord) => ({
            ...chord,
            sym: formatChord(transposeSymPrefer(chord.sym, steps, preferFlat), { style })
          }));
        }
      }
    }
    return JSON.stringify(doc);
  }
  function lintToJSON(chordpro) {
    if (typeof chordpro !== "string") {
      throw new TypeError(`lintToJSON: chordpro must be a string, got ${describe(chordpro)}`);
    }
    return JSON.stringify(lintChordPro(chordpro));
  }
  function hasMinRole2(userRole, minRole) {
    if (typeof userRole !== "string") {
      throw new TypeError(`hasMinRole: userRole must be a string, got ${describe(userRole)}`);
    }
    requireString("hasMinRole", "minRole", minRole);
    return hasMinRole(userRole, minRole);
  }
  function roleOrderJSON() {
    return JSON.stringify(ROLE_ORDER);
  }
  function slugify2(title) {
    if (typeof title !== "string") {
      throw new TypeError(`slugify: title must be a string, got ${describe(title)}`);
    }
    return slugify(title);
  }
  function insertAtCursorJSON(value, start, end, text) {
    requireEditArgs("insertAtCursorJSON", value, start, end);
    if (typeof text !== "string") {
      throw new TypeError(`insertAtCursorJSON: text must be a string, got ${describe(text)}`);
    }
    return JSON.stringify(insertAtCursor(value, { start, end }, text));
  }
  function wrapSectionJSON(value, start, end, directive, label) {
    requireEditArgs("wrapSectionJSON", value, start, end);
    requireString("wrapSectionJSON", "directive", directive);
    if (typeof label !== "string") {
      throw new TypeError(`wrapSectionJSON: label must be a string, got ${describe(label)}`);
    }
    return JSON.stringify(wrapSection(value, { start, end }, { directive, label }));
  }
  function sectionPresetsJSON() {
    return JSON.stringify(SECTION_PRESETS);
  }
  function diatonicChordsJSON(key) {
    if (typeof key !== "string") {
      throw new TypeError(`diatonicChordsJSON: key must be a string, got ${describe(key)}`);
    }
    return JSON.stringify(getDiatonicChords(key));
  }
  function chordVariantsJSON() {
    return JSON.stringify(CHORD_VARIANTS);
  }
  function chordToken(symbol) {
    requireString("chordToken", "symbol", symbol);
    return chordInsertToken(symbol);
  }
  function pdfDraftJSON(extractionJSON) {
    if (typeof extractionJSON !== "string" || extractionJSON.length === 0) {
      throw new TypeError(`pdfDraftJSON: extractionJSON must be a non-empty string, got ${describe(extractionJSON)}`);
    }
    let doc;
    try {
      doc = JSON.parse(extractionJSON);
    } catch (err) {
      throw new TypeError(`pdfDraftJSON: extractionJSON is not valid JSON \u2014 ${err.message}`);
    }
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.lines) || !Array.isArray(doc.pages)) {
      throw new TypeError("pdfDraftJSON: extractionJSON must decode to { lines: [], pages: [] }");
    }
    return JSON.stringify(buildSongDraft(doc));
  }
  function requireEditArgs(fn, value, start, end) {
    if (typeof value !== "string") {
      throw new TypeError(`${fn}: value must be a string, got ${describe(value)}`);
    }
    for (const [name, n] of [["start", start], ["end", end]]) {
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        throw new TypeError(`${fn}: ${name} must be a non-negative integer, got ${describe(n)}`);
      }
    }
    if (start > end) {
      throw new TypeError(`${fn}: start (${start}) must not exceed end (${end})`);
    }
  }
  function requireString(fn, name, value) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`${fn}: ${name} must be a non-empty string, got ${describe(value)}`);
    }
  }
  function requireStyle(fn, style) {
    if (!STYLES.includes(style)) {
      throw new TypeError(`${fn}: style must be one of ${STYLES.join("|")}, got ${describe(style)}`);
    }
  }
  function describe(value) {
    if (value === null) return "null";
    if (typeof value === "string") return `'${value}'`;
    return `${typeof value} ${String(value)}`;
  }
  return __toCommonJS(entry_exports);
})();
