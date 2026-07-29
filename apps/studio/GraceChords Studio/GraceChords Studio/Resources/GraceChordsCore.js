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
