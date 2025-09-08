# Experiments — Language Diversification Pack

Small, self-contained examples in various languages. Safe to keep in this folder;
they don't affect the React build. Most scripts read from `public/songs/` or `public/index.json`
if available, but degrade gracefully if not.

## Contents
- `rust/chord_tools`: Rust crate (future WASM candidate) with chord parsing/transpose stubs.
- `go/chordlint`: Go CLI that lints `.chordpro` metadata and prints basic stats.
- `python/bulk_convert.py`: Finds `.chordpro` files and shows how a converter could be wired.
- `lua/transpose.lua`: Demo transpose function for chords.
- `perl/chordpro_skeleton.pl`: Perl stub nod to ChordPro roots.
- `r/usage_report.R`: Mock analytics over song index (if present).
- `sql/schema.sql`: Example browser-side (sql.js) schema for offline queries.
- `scss/songbook.scss`: Future print styles starter.
- `bash/deploy.sh`: Example helper (does nothing destructive by default).
- `yaml/song_meta.example.yaml`: Example metadata layout in YAML.
- `toml/config.example.toml`: Example app config in TOML.

## How to use
- Keep these examples in `experiments/` or modify freely.
- Nothing here runs on GitHub Pages directly; they're for local dev / CI / future WASM ideas.
