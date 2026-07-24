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
  function describe(value) {
    if (value === null) return "null";
    if (typeof value === "string") return `'${value}'`;
    return `${typeof value} ${String(value)}`;
  }
  return __toCommonJS(entry_exports);
})();
