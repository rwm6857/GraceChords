Open a song to transpose chords, hide them, or export the chart.

## At a glance
- Transpose with the key selector or `[` and `]`
- Toggle chord display
- Toggle 1/2‑column reading view (site‑side only)
- Switch translation language with chips beside the song title
- Download PDF, JPG, PPTX, or ChordPro
- Watch an embedded reference video
- PPTX download appears when a slide deck exists in R2 (`pptx/<slug>.pptx`)

1. Select a song from the [[Song-Library]].
2. If translation chips are shown, click `EN/TR/AR/SP` to switch variants in-place.
3. Use the key selector or hide chords. Press `[` / `]` to step by semitone.
4. Use the 1/2‑column toggle for a two‑column reading view; sections stay together.
5. Open the **Download** menu and choose **PDF** for a print-ready chart, **JPG** for an image version (single-page songs only), or **ChordPro** for the source.
6. When a slide deck exists, a **PPTX** option appears in the same **Download** menu.
7. Use **Worship Mode** to open the song in Worship Mode with the current key selection.

Translation notes
- Translation grouping is not yet wired to the Supabase catalog, so chips do not currently appear.
- Chips are shown only when the song has multiple language variants in the same `song_id` group.
- The selected language is saved to `localStorage` (`pref:songLanguage`).

[[Slides-(PPTX)]] [[PDF-and-Printing]]
