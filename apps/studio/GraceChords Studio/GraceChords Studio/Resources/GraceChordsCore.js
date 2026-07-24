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
    parseToJSON: () => parseToJSON,
    transpose: () => transpose
  });

  // packages/core/src/chordpro/index.js
  var KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var FLAT = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  function norm(n) {
    return FLAT[n] || n;
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

  // apps/studio/js/entry.mjs
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
  function describe(value) {
    if (value === null) return "null";
    if (typeof value === "string") return `'${value}'`;
    return `${typeof value} ${String(value)}`;
  }
  return __toCommonJS(entry_exports);
})();
