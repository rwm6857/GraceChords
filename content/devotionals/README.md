# Hand-authored devotionals

Durable, human-editable devotional content. **This is the only place devotional
content is written by hand.**

Everything under `analysis/out/` is generated and gets rewritten on every build —
editing it there would be silently wiped on the next run and would break the
determinism the pipeline depends on. Content authored here is merged into the
export at build time by `analysis/export_content.mjs`.

37 of the 365 M'Cheyne days have no Spurgeon devotional keyed to anything they
read (see `analysis/out/open-days.md`). This directory is how those days get
filled.

## File format

One file per date, named `{MM}-{DD}.md`. There is no `02-29` — the leap day
resolves to `02-28`.

```markdown
---
reference: Acts 2:4
coreText: They were all filled with the Holy Ghost.
author: Ryan Moore
sourceWork: GraceChords
matchedChapter: Acts 2
---
The body goes here, as ordinary prose. Hard-wrap it however you like — lines
within a paragraph are joined back together. Separate paragraphs with a blank
line. Mark emphasis with _underscores_.

    Indent a stanza by four spaces to set it as verse.
    Each line stays on its own line rather than reflowing.
```

### Frontmatter

| Key | Required | Notes |
|---|---|---|
| `reference` | yes | Scripture the entry is built on. Becomes the card eyebrow and the slug. |
| `coreText` | yes | The opening scripture quotation. **This is the title** — the format has no separate title field. |
| `author` | yes | Attribution shown on the card and the full entry. |
| `sourceWork` | yes | The work it comes from. Use `GraceChords` for original writing. |
| `matchedChapter` | no | Which of the day's reading chapters this speaks to, e.g. `Acts 2`. Sets display order on a two-devotional day. |
| `replaces` | no | See collisions below. |
| `id` | no | Defaults to `authored-{MM}-{DD}`. |

Parsing is deliberately minimal and hand-rolled — `key: value` per line, optional
quotes, `#` comments ignored. No nesting, no lists, no YAML dependency.

### Body conventions

The body uses the **same conventions as the CCEL Spurgeon corpus** and goes
through the **same block parser**, so authored and imported content render
identically by construction rather than by two implementations agreeing:

- blank line separates blocks
- a block whose every line is indented is a verse stanza; its lines stay discrete
- prose lines are unwrapped onto one line
- a line ending in `-` joins the next with no space (a hyphenated compound broken
  across lines)
- `_text_` becomes an italic span

## Collisions

An authored entry **fills an open slot by default**. A day holds at most two
devotionals.

If the day is already full, **the build fails** with an error naming both
occupants. To displace one, name it explicitly:

```yaml
replaces: 07-10-PM
```

Never a silent override. Naming an id the day does not hold also fails.

## Building

```bash
node analysis/export_content.mjs
```

Reports every merged entry, every collision, and how many days remain open. An
empty or absent `content/devotionals/` is not an error — the build succeeds
unchanged and reports zero merged.
