Solve common issues when running or using GraceChords.

## App & Data

**Songs not loading**
- Check your Supabase credentials (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in `.env`.
- Open browser DevTools → Network and look for failed Supabase API calls.
- Confirm RLS policies allow the anon role to `SELECT` from `public.songs`.

**Posts not loading**
- Same as above but for `public.posts`.

**Search returns no results**
- Confirm songs exist in the `public.songs` Supabase table with `is_deleted = false`.

## PPTX Slides

**Upload fails**
- Ensure `VITE_PPTX_WORKER_URL` is set to the deployed Worker URL.
- Confirm you have at least Collaborator role.
- Check the Worker logs in the Cloudflare dashboard for JWT or CORS errors.

**Download PPTX button missing**
- The button only appears when a file exists in R2 for that song slug. Upload the file via the editor first.

## Bible / Daily Word

**Chapter fails to load**
- Ensure `VITE_R2_PUBLIC_URL` is set to the correct R2 public URL (e.g. `https://assets.gracechords.com`).
- In development, Vite proxies `/bible/*` to this URL. In production, the CF Pages Function (`functions/bible/[[path]].js`) proxies it server-side.
- Confirm the R2 bucket is public or the Pages Function has read access.

## PDF & Fonts

**Fonts missing in PDF**
- Confirm PDF font files exist under `src/assets/fonts/` (UI fonts live under `public/fonts/` — these are different).
- Required: `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`, and Mono variants.

**PDF sections split across pages**
- Edit lyrics line length, or try reducing font size. Section blocks stay together by design; a very long section may still wrap.

**JPG export is single-page only** — this is expected.

## Deployment

**CF Pages build fails**
- Check that all required environment variables are set in the Cloudflare Pages dashboard (especially `SUPABASE_SERVICE_ROLE_KEY` for build scripts).
- Review build logs in Cloudflare Pages → Deployments.

**Site shows stale content after deploy**
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R).
- If a service worker is caching aggressively, open DevTools → Application → Service Workers and click **Unregister**, then reload.
- Visit `?reset_sw=1` to trigger SW cleanup.

## Other

**Custom domain not resolving**
- Check DNS settings in Cloudflare dashboard. CF Pages custom domains use Cloudflare DNS.

**Cloudinary images not uploading**
- Verify `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` are correct.
- Confirm the upload preset in Cloudinary is set to **unsigned**.

[[PDF-and-Printing]] [[Slides-(PPTX)]] [[Build-and-Deploy]] [[Cloudflare-Infrastructure]]
