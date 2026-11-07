Write songs in the ChordPro format used by GraceChords.

## At a glance
- Section headers can be natural (e.g., `Verse 1`) or emitted via directives; rendering normalizes styles
- Chords go in brackets on lyric lines (e.g., `[C]Amazing [F]grace`)
- Song metadata (title, key, artist, tags, country, language, tempo, time signature, YouTube) is entered in the song editor's form fields at `/portal/editor`, not as directives in the song body
- Lines starting with `#` are comments and are not rendered

```chordpro
{capo: 2}

Verse 1
[A]Amazing [D]grace
```

### Metadata
Use the editor's **Metadata** panel:
- **Title** — required; used across the app and for sorting
- **Key** — required; original key (e.g., `C`, `Am`, `F#m`)
- **Tags** — at least one required (e.g., `worship, slow, chorus-only`)
- **Artist**, **Country**, **Language**, **Time Signature**, **Tempo (BPM)**, **YouTube ID or URL** — optional
- `{capo: N}` — optional numeric capo value, written in the song body

**Import ChordPro** in the editor reads `{title}`, `{artist}`/`{author}`/`{composer}`, `{key}`, `{tempo}`, `{time}`, `{tags}`, `{country}`, `{lang}` and `{youtube}` directives from an imported file into the form fields.

### Translations
The editor has a **Language** field, but translation grouping is not yet wired to the Supabase catalog, so translations are not linked in the app.

### Sections
You can use plain headers (`Verse`, `Verse 1`, `Chorus`, `Bridge`, `Tag`, `Intro`, `Outro`) or ChordPro‑style directives. The editor's **Section** buttons wrap selected text with `{start_of_…}`/`{end_of_…}` directives.

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
- Save from the song editor (`/portal/editor`) to write directly to Supabase — there is no separate index build step
- Use UTF-8 text in song files; Turkish characters (`ıüşiçöğ` and `IÜŞİÇÖĞ`) are supported in app rendering and PDF/JPG exports

[[Adding-and-Editing-Songs]] [[Index-Building]]
