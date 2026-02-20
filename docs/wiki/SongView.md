Open a song to transpose chords, hide them, or export the chart.

## At a glance
- Transpose up or down (`[` and `]`)
- Toggle chord display (`c`)
- Toggle 1/2‑column reading view (site‑side only)
- Switch translation language with chips beside the song title
- Download PDF or JPG
- Watch an embedded reference video
- PPTX button appears when `public/pptx/<slug>.pptx` exists
- ICP badge appears on songs tagged `ICP` (InterCP International); SEO metadata is extended automatically.

1. Select a song from [[Home-Search-and-Filters]].
2. If translation chips are shown, click `EN/TR/AR/SP` to switch variants in-place.
3. Use the transpose buttons or hide chords. Press `[` / `]` to step by semitone, `c` to toggle chords.
4. Enable the “View: 2 columns” toggle for a two‑column reading view; sections stay together.
5. Choose **Download PDF** for a print-ready chart or **Download JPG** for an image version.
6. When a slide deck exists, a **Download PPTX** button appears above the video block.
7. Use **Open in Worship Mode** to open the selected language variant with current key selection.

Translation notes
- Chips are shown only when the song has multiple language variants in the same `song_id` group.
- The selected language is saved to `localStorage` (`pref:songLanguage`).
- Media metadata (`youtube`, `mp3`, `pptx`) and core metadata (`key`, tags/authors/country) inherit from English variant unless translation overrides with non-empty values.

[[Slides-(PPTX)]] [[PDF-and-Printing]]
