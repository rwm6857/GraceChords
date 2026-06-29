# GraceChords Wiki (source)

These Markdown files are the source of the GitHub Wiki.

Sync is handled by `.github/workflows/wiki-sync.yml` using `scripts/syncWiki.mjs`.

Tips
- Place images under `public/wiki-assets/` and reference them as `![](../wiki-assets/your-image.png)`
- Edit or add pages under `public/wiki/` then push to `main` to trigger sync
- To diagnose setup issues, run: `node scripts/verifyWikiSetup.mjs`
