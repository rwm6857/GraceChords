Provide PowerPoint slides for songs that need projection.

## At a glance
- Save files as `public/pptx/<slug>.pptx`
- The app checks for a file by slug and shows a download button when found
- Smaller file sizes load faster for setlists
- Setlist bundle PPTX includes only existing slide files

1. Name the PPTX exactly after the song slug (e.g., `glorious-king.pptx`).
2. Place it under `public/pptx/`.
3. In [[SongView]] a **Download PPTX** button appears above the video when available.
4. The Setlist export collects available PPTX files and names them with index order.

[[Setlists]]
