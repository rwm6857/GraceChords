Provide PowerPoint slides for songs that need projection.

## Storage
PPTX slide decks are stored in **Cloudflare R2** (`gracechords-bible` bucket, `pptx/` prefix). Files are named by song slug (e.g., `glorious_king.pptx`).

## Uploading a Slide Deck

Uploads go through the `gracechords-pptx-upload` Cloudflare Worker which validates your session and role before writing to R2.

1. Open the song in the song editor (`/portal/editor/<slug>`). The song must be saved first.
2. In the PPTX section of the metadata form, choose a `.pptx` file and click **Upload PPTX**.
3. Files are limited to 20 MB (and 10 uploads per 5 minutes per user).
4. The worker validates your JWT (Editor+ required) and saves the file to R2.
5. A **PPTX** option appears in the Song page's **Download** menu once the file is present.

To delete a deck, click **Delete** in the editor's PPTX section (the button is shown to Admin+).

## Worker setup
The Worker is deployed separately from the main SPA. See [`workers/pptx-upload/README.md`](https://github.com/rwm6857/GraceChords/blob/main/workers/pptx-upload/README.md) for:
- Wrangler secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`)
- R2 bucket binding
- Local dev instructions

Set the Worker URL in your environment:
```env
VITE_PPTX_WORKER_URL=https://gracechords-pptx-upload.your-subdomain.workers.dev
```

## Setlist
When exporting a setlist as PPTX (**PPT** → **Separate** ZIP or **Combined** deck), only songs with an existing deck in R2 are included. The app fetches the files at export time. The Songbook Builder exports PDF only.

[[Setlists]] [[Cloudflare-Infrastructure]]
