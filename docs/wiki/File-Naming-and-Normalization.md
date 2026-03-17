Rules for consistent song and slide filenames and how to normalize existing files.

## Naming rules
- Lowercase; use underscores for word breaks: spaces and dashes → `_`.
- Strip punctuation like quotes or smart quotes.
- Song files end with `.chordpro`; slides end with `.pptx`.

Examples
- `All-In-All.chordpro` → `all_in_all.chordpro`
- `Here‑I‑Am.pptx` → `here_i_am.pptx`

## Normalize via script
Run the normalizer to rename songs and align PPTX names:
```bash
npm run normalize
```
What it does
- Renames hyphenated `.chordpro` files to underscores.
- If both `above-all.chordpro` and `above_all.chordpro` exist, keeps the underscore file and deletes the hyphen one.
- Copies PPTX from `TO_RENAME/` to `public/pptx/`, normalizing names to underscores.

After normalizing, rebuild the index:
```bash
npm run build-index
```

Notes
- The script deletes duplicate variants; review the summary output before committing.
- Keep large PPTX files optimized so downloads remain fast.

