Provide PowerPoint slides for songs that need projection.

## At a glance
- Save files as `public/pptx/<slug>.pptx` using underscores (e.g., `glorious_king.pptx`).
- The app checks for a file by song slug and shows a download button when found.
- Smaller files load faster for setlists; optimize media and images.
- Setlist bundle PPTX includes only existing slide files.

Workflow
1) Drop raw slides in `TO_RENAME/`.
2) Run `npm run normalize` to copy into `public/pptx/` with normalized underscore names.
3) In [[SongView]] a Download PPTX button appears when available.

[[Setlists]]
