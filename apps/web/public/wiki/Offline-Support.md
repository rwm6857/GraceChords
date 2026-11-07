GraceChords caches key assets for offline use via a service worker (`src/sw.js`).

## At a glance
- JS, CSS, fonts, images, and pages you've already opened are cached by the service worker (song data from Supabase is not cached by it)
- Each deploy gets a new cache, so cached files update when you revisit after a new version is released
- Offline mode excludes features that require live network requests
- Navigations use a network‑first strategy so new deploys and edits appear promptly (songs themselves come from Supabase, not the cache)

## Tips & Troubleshooting
- Stale assets: hard refresh (Ctrl+Shift+R) to fetch the latest bundle
- Clear site data via browser settings or DevTools > Application > Clear storage
- Unregister the service worker if caching problems persist:
  ```js
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
  ```
- Build with `VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build` so each deploy gets a fresh cache name and the worker invalidates the previous one.

[[Troubleshooting]]
