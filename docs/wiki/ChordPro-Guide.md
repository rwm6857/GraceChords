Write songs in the ChordPro format used by GraceChords.

## At a glance
- Section headers can be natural (e.g., `Verse 1`) or emitted via directives; rendering normalizes styles
- Chords go in brackets on lyric lines (e.g., `[C]Amazing [F]grace`)
- Directives capture metadata like `{title:}`, `{key:}`, `{capo:}`, `{tags:}`, `{authors:}`, `{country:}` and media links
- Translation groups are linked by `{song_id: ...}` and language is set with `{lang: ...}` (`en` if omitted)

```chordpro
{title: Glorious King}
{song_id: glorify-your-name}
{lang: en}
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

### Translation metadata
- `{song_id: ...}` — required for linking translations of the same song
- `{lang: ...}` — canonical language field (`en`, `tr`, `ar`, `es`); if omitted, GraceChords assumes `en`
- Titles can differ across translations (for example, `Send Us Lord` vs `Rab Bizi Gonder`)
- Legacy aliases are still accepted during migration (`songid`, `translation_group`, `translation_of`, `language`, `locale`)

Example translation pair:
```chordpro
{title: Send Us Lord}
{song_id: send-us-lord}
{lang: en}
{key: A}
...
```

```chordpro
{title: Rab Bizi Gonder}
{song_id: send-us-lord}
{lang: tr}
...
```

### Metadata inheritance rules
For each translation group, GraceChords treats the English file as master/source of truth when present.

- Inherited unless overridden: `key`, `tags`, `authors`, `country`, `youtube`, `mp3`, `pptx`
- Translation values override only when the translation file sets a non-empty value
- Missing or blank values in translation files inherit from English
- If no English variant exists, the first complete variant becomes fallback master

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
- Use UTF-8 text in song files; Turkish characters (`ıüşiçöğ` and `IÜŞİÇÖĞ`) are supported in app rendering and PDF/JPG exports

[[Admin-Tool]] [[Index-Building]]
