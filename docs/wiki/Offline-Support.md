GraceChords caches key assets for offline use.

## At a glance
- JS, CSS, fonts, and previously opened songs are stored by a service worker
- Cached files update when you revisit the site and a new version is available
- Offline mode excludes features that require network requests
 - Song files (`/songs/**`) and the index (`/src/data/index.json`) use a network‑first strategy so edits appear promptly after deploy

## Troubleshooting
- Stale assets: hard refresh (Ctrl+Shift+R) to fetch the latest bundle
- Clear site data via browser settings or DevTools > Application > Clear storage
- Unregister the service worker if caching problems persist
 - Tip: build with `VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build` so each deploy gets a fresh cache name.

[[Troubleshooting]]
