Provide PowerPoint slides for songs that need projection.

## Storage
PPTX slide decks are stored in **Cloudflare R2** (`gracechords-bible` bucket, `pptx/` prefix). Files are named by song slug (e.g., `glorious_king.pptx`).

## Uploading a Slide Deck

Uploads go through the `gracechords-pptx-upload` Cloudflare Worker which validates your session and role before writing to R2.

1. Open the song in the Editor Portal (`/editor`).
2. In the PPTX section of the editor, click **Upload PPTX**.
3. Select the `.pptx` file (20 MB max).
4. The worker validates your JWT (Collaborator+ required) and saves the file to R2.
5. A **Download PPTX** button will appear on the Song page once the file is present.

To delete a deck, click **Delete PPTX** in the editor (Editor+ role required).

## Worker setup
The Worker is deployed separately from the main SPA. See [`workers/pptx-upload/README.md`](../workers/pptx-upload/README.md) for:
- Wrangler secrets (`SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`)
- R2 bucket binding
- Local dev instructions

Set the Worker URL in your environment:
```env
VITE_PPTX_WORKER_URL=https://gracechords-pptx-upload.your-subdomain.workers.dev
```

## Setlist & Songbook
When exporting a setlist or songbook as a PPTX bundle, only songs with an existing deck in R2 are included. The app fetches the file at export time.

[[Setlists]] [[Cloudflare-Infrastructure]]
