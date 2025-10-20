GraceChords caches key assets for offline use via a service worker (`src/sw.js`).

## At a glance
- JS, CSS, fonts, and previously opened songs are cached by the service worker
- Cached files update when you revisit and a new version is available
- Offline mode excludes features that require live network requests
- Song files (`/songs/**`) and the index (`/src/data/index.json`) use a network‑first strategy so edits appear promptly after deploy

## Tips & Troubleshooting
- Stale assets: hard refresh (Ctrl+Shift+R) to fetch the latest bundle
- Clear site data via browser settings or DevTools > Application > Clear storage
- Unregister the service worker if caching problems persist:
  ```js
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
  ```
- Build with `VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build` so each deploy gets a fresh cache name and the worker invalidates the previous one.

[[Troubleshooting]]
