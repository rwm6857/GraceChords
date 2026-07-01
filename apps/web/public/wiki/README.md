# GraceChords Wiki (source)

These Markdown files are the source of the GitHub Wiki. **Edit them here**, not on
the live wiki — the live wiki is overwritten by sync.

Sync is handled by `.github/workflows/wiki-sync.yml`, which runs
`apps/web/scripts/syncWiki.mjs` (from the `apps/web` working directory). It fires
automatically when you push changes under `apps/web/public/wiki/**` to `main`
(requires the `WIKI_PUSH_TOKEN` repo secret).

Tips
- Place images under `apps/web/public/wiki-assets/` and reference them as `![](../wiki-assets/your-image.png)`.
- To sync manually, run the `wiki-sync.yml` workflow from the Actions tab, or locally:
  ```bash
  cd apps/web && WIKI_PUSH_TOKEN=<your_PAT> node scripts/syncWiki.mjs
  ```
- To diagnose setup issues: `cd apps/web && node scripts/verifyWikiSetup.mjs`
