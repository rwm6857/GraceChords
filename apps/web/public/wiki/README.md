# GraceChords Wiki (source)

These Markdown files are the source of the GitHub Wiki. **Edit them here**, not on
the live wiki — the live wiki is overwritten by sync.

Sync is handled by `.github/workflows/wiki-sync.yml`, which runs
`apps/web/scripts/syncWiki.mjs` (from the `apps/web` working directory). It fires
automatically when you push changes under `apps/web/public/wiki/**` to `main`
(requires the `WIKI_PUSH_TOKEN` repo secret).

Tips
- The sync copies everything under `apps/web/public/wiki/` (including images) — `apps/web/public/wiki-assets/` is not synced. Put images in a subfolder here (e.g. `images/`) and reference them relatively, e.g. `![](images/your-image.png)`.
- To sync manually, run the `wiki-sync.yml` workflow from the Actions tab, or locally:
  ```bash
  cd apps/web && GITHUB_REPOSITORY=rwm6857/GraceChords WIKI_PUSH_TOKEN=<your_PAT> node scripts/syncWiki.mjs
  ```
- To diagnose setup issues: `cd apps/web && node scripts/verifyWikiSetup.mjs`
