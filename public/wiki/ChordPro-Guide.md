Write songs in the ChordPro format used by GraceChords.

## At a glance
- Section headers can be natural (e.g., `Verse 1`) or emitted via directives; rendering normalizes styles
- Chords go in brackets on lyric lines (e.g., `[C]Amazing [F]grace`)
- Directives capture metadata like `{title:}`, `{key:}`, `{capo:}`, `{tags:}`, `{authors:}`, `{country:}` and media links

```chordpro
{title: Glorious King}
{key: A}
{tags: praise, fast}
{authors: Jane Smith}
{country: US}
{youtube: https://www.youtube.com/watch?v=...}
{mp3: https://example.com/track.mp3}
{pptx: glorious_king.pptx}

# Verse 1
[A]Amazing [D]grace
```

### Recommended metadata
- `{title: ...}` — required; used across the app and for sorting
- `{key: ...}` — original key (e.g., `C`, `Am`, `F#m`)
- `{capo: N}` — optional numeric capo value
- `{tags: ...}` — comma‑separated list (e.g., `worship, slow, chorus-only`)
- `{authors: ...}` — author/composer details
- `{country: ...}` — optional origin
- `{youtube: ...}`, `{mp3: ...}` — optional media URLs
- `{pptx: ...}` — optional slide deck filename under `public/pptx/`

### Sections
You can use plain headers (`Verse`, `Verse 1`, `Chorus`, `Bridge`, `Tag`, `Intro`, `Instrumental`) or ChordPro‑style directives. The Admin tool can emit either mode.

Directive examples
```chordpro
{sov: Verse 1}
[C]Line with [F]chords
{eov}

{soc: Chorus}
[G]Another line
{eoc}

{sob: Bridge}
[Am]Instrumental or [F]alt section
{eob}
```

### Tips
- Keep lines as concise as practical to improve PDF fit
- Prefer underscores in filenames (use `npm run normalize`)
- After editing/adding songs, run `npm run build-index`

[[Admin-Tool]] [[Index-Building]]
