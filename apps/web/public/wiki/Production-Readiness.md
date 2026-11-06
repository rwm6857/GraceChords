# Production Readiness

How gracechords.com is configured for production, what to set in each dashboard, how to verify each piece, and what to do when one breaks. The pre-launch checklist is at the end.

The quickest health check for everything on this page:

```bash
npm run smoke:prod -w @gracechords/web
```

It checks TLS, the HTTP→HTTPS redirect, security headers, asset caching, key routes, the 404 status, robots/sitemap, deep-link files and the crash-report endpoint, then exits non-zero if anything fails. Point it at a preview with `SMOKE_ORIGIN=https://<hash>.gracechords.pages.dev`.

---

## 1. Environment configuration

**In code**
- All client config comes from `VITE_*` variables, documented in [`.env.example`](https://github.com/rwm6857/GraceChords/blob/main/.env.example). The web build reads the repo-root `.env` (Vite `envDir`).
- The Supabase `preconnect`/`dns-prefetch` hints are generated from `VITE_SUPABASE_URL` by the `inject-supabase-preconnect` plugin in `apps/web/vite.config.js`. The project URL is no longer hard-coded in `index.html`, and a build without the variable just leaves the hints out.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `BOT_WEBHOOK_TOKEN`, `OPENAI_API_KEY`, …) are read only by Pages Functions, Workers and Node build scripts. They are never prefixed `VITE_`.
- Production vs. development: `import.meta.env.PROD` gates the service worker and crash reporting, so neither runs under `npm run dev`. Cloudflare's **Production** and **Preview** environments have separate variable sets (see [[Build-and-Deploy]] and `MONOREPO_MIGRATION.md`).

**Platform settings: Cloudflare Pages → gracechords → Settings**
| Setting | Value |
|---|---|
| Root directory | `apps/web` |
| Build command | `cd ../.. && npm ci && npm run build -w @gracechords/web` |
| Build output | `dist` |
| Production branch | `main` |
| Variables (Production **and** Preview) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_R2_PUBLIC_URL`, `VITE_PPTX_WORKER_URL`, `VITE_CLOUDINARY_*`, `VITE_ENABLE_DISCLAIMER`, `VITE_CONTACT_EMAIL` |
| Variables (Production only) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOT_INTERNAL_URL`, `BOT_WEBHOOK_TOKEN`, `OPENAI_API_KEY`, `BIBLE_CDN_URL` |
| `VITE_COMMIT_SHA` | Set it to the commit (`$CF_PAGES_COMMIT_SHA`) so each deploy gets a fresh service-worker cache. Without it the build falls back to a timestamp, which also busts the cache but can't be traced to a commit. |

**Supabase → Authentication → URL Configuration**: Site URL `https://gracechords.com`. Redirect URLs include `https://gracechords.com/auth/callback`, `https://gracechords.com/reset-password`, the `/app/...` variants used by the mobile app, and `https://*.gracechords.pages.dev/**` if you sign in on previews.

**Test:** open a Preview deploy, sign in, and load a song. In DevTools → Elements, `<head>` should contain `<link rel="preconnect" href="https://<project>.supabase.co">`.

**Troubleshooting**
- *Preview builds green but the page is blank:* `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` aren't set on **Preview**. The client throws `supabaseUrl is required` at load.
- *Build fails at `generate-seo-pages.mjs`:* `SUPABASE_SERVICE_ROLE_KEY` is missing on Production. Previews skip that step automatically.
- *OAuth returns to the wrong host:* add the exact URL to Supabase Redirect URLs. A trailing slash matters.

### Sign-in providers and account security (Supabase dashboard)

None of this lives in the repo (there is no `supabase/config.toml`), so it is recorded here.

**Sign in with Apple on the web.** Native iOS sign-in uses the app's bundle ID and needs no secret. The web uses Apple's OAuth flow, which needs a Services ID and a client secret.
1. Apple Developer → Identifiers → **Services IDs** → create `com.gracechords.web` and enable *Sign in with Apple*.
2. Configure it with **Primary App ID `com.gracechords.app`**. This is what makes Apple return the same user id on the web as on iOS, so an iOS user lands in their existing account. With a different primary App ID they would get a second account.
3. Domains: `<project>.supabase.co`. Return URL: `https://<project>.supabase.co/auth/v1/callback`.
4. Keys → create a key with *Sign in with Apple* (primary App ID `com.gracechords.app`) and download the `.p8`. Keep it in the password manager, never in the repo.
5. Generate the secret: `node apps/web/scripts/apple-client-secret.mjs --team J7Y8NYZ48Q --key-id <KEY_ID> --services-id com.gracechords.web --p8 <path>`.
6. Supabase → Authentication → Providers → **Apple**: Client IDs `com.gracechords.web,com.gracechords.app` (Services ID first; the bundle ID keeps native iOS working), Secret Key = the JWT from step 5.

**The Apple secret expires (Apple caps it at 6 months), so it is rotated automatically.** The `Rotate Sign in with Apple secret` workflow (`.github/workflows/rotate-apple-secret.yml`) runs on the 1st of every month, mints a fresh 180-day secret, and writes it to Supabase through the Management API. Because each secret lasts about five months longer than the gap between runs, several failed runs in a row still leave a working secret. A failed run emails you.
- One-time setup: add the repository secrets `APPLE_P8` (the full `.p8` contents), `APPLE_KEY_ID`, `APPLE_TEAM_ID`, `APPLE_SERVICES_ID`, `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens) and `SUPABASE_PROJECT_REF`. Then run the workflow once by hand from the Actions tab.
- Apple has no way to test a secret short of a real sign-in. After the first run, or after changing any of those secrets, try "Continue with Apple" on the site.
- If the workflow is ever disabled (GitHub pauses scheduled workflows after 60 days without repository activity), web Apple sign-in and linking fail when the last secret lapses. iOS keeps working. To recover, re-enable the workflow and run it, or run step 5 by hand and paste the value.

**Auth settings** (Authentication → Providers → Email, and Authentication → Sign In / Providers):
- **Secure password change: ON.** A password change on a session older than 24h needs reauthentication. The apps prove it with the current password, or for Apple/Google-only accounts setting a first password, with an emailed code.
- **Allow manual linking: ON.** Profile → Security (web) and Account → Sign-in methods (app) connect Apple/Google to an existing account. Supabase still auto-links identities that share a verified email; manual linking covers the rest, chiefly Apple *Hide My Email* addresses.
- **Password policy:** minimum 8, with lowercase, uppercase, digits and symbols. It must match `PASSWORD_POLICY` in `packages/core/src/auth/passwordPolicy.ts`, which both apps validate against.
- Leaked-password protection needs a paid plan, so it is off.

**Email delivery.** Reset links, confirmation links and reauthentication codes all go through Supabase's mailer.
- Use **custom SMTP**. The built-in sender is rate-limited to a handful of emails per hour.
- Register the SMTP sending domain/address in Apple Developer → *Sign in with Apple for Email Communication* (with SPF). Without it, mail to `@privaterelay.appleid.com` addresses is silently dropped, so Apple users with Hide My Email never get reset or reauthentication emails.

**Test** (on a Preview whose URL is in Redirect URLs):
- Continue with Apple on `/login` in Safari and in Chrome. It should land in the *same* account you use on iOS.
- Profile → Security: change your password, then connect and disconnect Google.
- With an Apple-only test account: set a password, then sign in with email + password.

---

## 2. Error handling & UX

**In code**
- **Two error boundaries.** The app-wide one in `src/App.jsx` catches crashes in the shell. A route-level one wraps `<Outlet />` in `Layout`, keyed on the path, so a crashing page keeps the navbar usable and navigating away clears the error. Both use `src/components/ErrorBoundary.jsx`, which shows a copyable error report (readable on phones) plus Reload / Go to home page links.
- **Stale-deploy recovery.** `src/utils/app/lazyRoute.js` and `main.jsx` reload once, after purging the asset caches, when a route chunk fails to load. The boundary shows "This page didn't finish loading" if that doesn't help.
- **404.** Unknown routes render `src/pages/NotFoundPage.jsx` inside the nav layout (localized, `noindex`). Cloudflare also returns real HTTP 404 status for them because `404.html` exists.
- **Offline.** `src/components/OfflineBanner.jsx` shows a band under the announcement strip while `navigator.onLine` is false. Previously visited pages keep working through the service worker (see [[Offline-Support]]).
- **There's no separate 500 page.** There's no server rendering, so a "500" can only come from a Pages Function, and those return JSON to the UI that called them. A crash in the browser is the error boundary's job.
- **Loading states.** Route chunks suspend to a loading fallback. Data hooks (`useSongs`, `usePosts`, setlists) expose `loading`/`error`/`retry`, and exports show the `Busy` overlay. Audit new async UI against that pattern.

**Test**
- Visit `/definitely-not-a-page`: you should get "Page not found" with the navbar, and `curl -sI https://gracechords.com/definitely-not-a-page` should return `404`.
- In DevTools → Network, set "Offline": the yellow offline band should appear, and clear when you go back online.
- Route boundary: covered by `src/__tests__/productionErrors.test.jsx`.

**Troubleshooting**
- *"Something went wrong" right after a deploy:* usually a stale tab. Reloading fixes it. If it persists, visit `/?reset_sw=1`.
- *Wrong page title after navigating:* the page has no `<Helmet><title>`. It falls back to "GraceChords" via the default in `App.jsx`, so add a title to that page.

---

## 3. Production optimization

**In code**
- **Assets.** Vite content-hashes everything under `/assets/`. `public/_headers` now serves those with `Cache-Control: public, max-age=31536000, immutable`, while HTML and `sw.js` keep Cloudflare's revalidate-every-time default so deploys take effect immediately. The home hero ships responsive WebP (640–1536) with a build-injected preload; the PNG originals in `src/assets/` are no longer imported, so they never ship. Run `ANALYZE=1 npx vite build` (in `apps/web`) for a bundle treemap at `dist/stats.html`.
- **Console output.** Production code has no stray `console.log`. The three remaining calls are opt-in PDF traces (`localStorage.pdfFontTrace` / `PDF_TRACE`). `console.error`/`console.warn` are kept on purpose because they help debugging on users' devices.
- **Security headers** (`public/_headers`): `frame-ancestors 'none'`, `nosniff`, `strict-origin-when-cross-origin`, HSTS (one year; no `includeSubDomains` or `preload` until every subdomain is HTTPS-only), and a `Permissions-Policy` that turns off camera, microphone, geolocation, payment and USB, none of which the web app uses.
- **SEO.** Per-route `<Helmet>` titles, descriptions, canonicals and Open Graph tags. `generate-seo-pages.mjs` pre-renders `/songs/:id`, `/posts/:slug`, `/privacy`, `/terms` and `/delete-account`, and `generate-sitemap.mjs` writes the sitemap. `robots.txt` now keeps auth, profile, admin and editor routes out of search results.
- **Responsive.** `useIsMobile()` drives layout switches, and the mobile action sheet, dock and pane tabs cover the narrow layouts.

**Test**
- `curl -sI https://gracechords.com/assets/<any index-*.js>` should show `immutable`.
- Run `npm run pagespeed -w @gracechords/web` (reads `PAGESPEED_API_KEY` from `.env`), <https://pagespeed.web.dev>, or Lighthouse in Chrome DevTools at Mobile. Track LCP and CLS.
- Responsive: check Home, Songs, a song, Setlist and Songbook at 375 px and 768 px in DevTools device mode. There should be no horizontal scrolling.
- SEO: paste a song URL into <https://search.google.com/test/rich-results> and Facebook's Sharing Debugger.

**Troubleshooting**
- *Users stuck on old JS after a deploy:* hashed filenames change on every build, so `immutable` can't pin old code. Check that `index.html` itself isn't long-cached by a Cloudflare Cache Rule (it must revalidate).
- *Google indexes a login page:* it was crawled before the `robots.txt` change. Use Search Console → Removals.

---

## 4. Monitoring & deployment

**Crash reports (self-hosted, no third party, no Telegram)**
- `src/utils/app/errorReporter.js` sends one report per distinct error (at most 5 per page load) from production builds: the error boundary, `window.onerror`, and unhandled rejections. Each report contains the error, stack, page *path* (never the query or hash), user agent and release SHA. It never includes user IDs, emails or content. Chunk-load errors and extension noise are skipped.
- `functions/api/client-error.js` accepts only same-origin JSON up to 16 KB, logs every report, and stores it in Supabase through `log_client_error()` using the existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, so there are no new variables.
- **`public.client_errors`** (migration `20261105120000_client_errors.sql`) keeps **one row per distinct error** with `count`, `first_seen` and `last_seen`, plus the most recent path, browser and release. Rows unseen for 90 days are pruned automatically, and the table stops accepting *new* errors past 5,000 distinct rows. RLS is on with no policies, so only the service role can read or write it.
- **Apply the migration by hand** (the repo never uses `db push`): `supabase db query --linked -f supabase/migrations/20261105120000_client_errors.sql`, or paste it into Dashboard → SQL Editor. Until then reports still reach the Cloudflare logs, and the function logs `[client-error] store failed 404`.

**Reading the crash log**
- Supabase Dashboard → Table Editor → `client_errors` → sort by `last_seen` descending.
- Or run this in the SQL Editor for "what broke this week, worst first":
  ```sql
  select count, last_seen, name, message, path, release, left(stack, 300) as stack
  from client_errors
  where last_seen > now() - interval '7 days'
  order by count desc, last_seen desc;
  ```
- Once a bug is fixed and deployed, delete its row (`delete from client_errors where fingerprint = '…'`) so a recurrence shows up as new.
- `release` is the commit SHA, so `git show <release>` tells you which deploy the user was running.

**Visit statistics: Cloudflare Web Analytics**
Open it from the Cloudflare dashboard → **Analytics & Logs → Web Analytics** → the gracechords.com site. (On the Pages project, Metrics → Web Analytics links to the same place.)
- **Top of the page:** visits (arrivals from outside the site), page views, and page load time for the selected range. The time picker is at the top right.
- **Breakdown panels:** click any row to filter the whole page to it.
  - *Path:* which pages people read. Filter Path → contains `/songs/` to rank songs, or `/reading` for Daily Word.
  - *Referer:* where visitors come from (Google, Facebook, a church's site, direct).
  - *Country*, *Device type* (how much is mobile), *Browser* and *OS*.
- **Core Web Vitals tab:** LCP, INP and CLS as good / needs improvement / poor. The debug view lists the paths and page elements behind poor scores, so it's where to look before any performance work.
- Numbers are sampled and aggregated, with no per-visitor detail by design. Expect them to run lower than server request counts, because bots and visitors who block scripts aren't counted.

Questions it answers well: are people using the site more than last month, which songs to prioritise, what share is on phones (useful for deciding web versus app work), and did a deploy slow pages down.

**Rate limit the crash endpoint (WAF)**
Cloudflare dashboard → select the **gracechords.com** domain → **Security → WAF → Rate limiting rules** tab → **Create rule**. In the newer dashboard this is **Security → Security rules → Create rule → Rate limiting rule**.
| Field | Value |
|---|---|
| Rule name | `client-error rate limit` |
| If incoming requests match | Field **URI Path**, operator **equals**, value `/api/client-error` |
| With the same characteristics | **IP** (the free plan's only option) |
| When rate exceeds | **20** requests per **10 seconds** |
| Then take action | **Block** for **10 seconds** |
Click **Deploy**. The free plan allows one rule and fixes the period and block duration at 10 seconds, which is all this needs. A real browser sends at most 5 reports per page load, so normal users never get near it.

*Test:* run this and expect `403`s followed by `429`s once the limit kicks in:
```bash
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code} " -X POST https://gracechords.com/api/client-error -H 'Origin: https://test.invalid'; done; echo
```

**Logs:** Workers & Pages → gracechords → Deployments → (deployment) → Functions → *Real-time logs*. Filter on `[client-error]`. These logs are live-only, and the Supabase table is the durable record.

**Automatic deployment** is Cloudflare Pages' GitHub integration. Every push to `main` deploys production, and every other branch gets a Preview URL. Confirm under Settings → Builds & deployments that production branch = `main` and preview branches = all non-production branches.

**Uptime / domain / SSL**
- `.github/workflows/prod-smoke.yml` runs the smoke test when the "Cloudflare Pages" check completes on `main`, and every 6 hours. GitHub emails you when a run fails, which makes it a free uptime and certificate-expiry monitor.
- SSL was checked from outside on 2026-11-05 and is already correct: HTTP gets a 301 to HTTPS, TLS 1.0 and 1.1 are refused, and TLS 1.2 and 1.3 are accepted. The certificate is Cloudflare-managed (Google Trust Services, 90-day, auto-renewed about 30 days before expiry). To review the settings: gracechords.com → **SSL/TLS → Overview** (encryption mode *Full (strict)*, which only matters for proxied records other than Pages) and **SSL/TLS → Edge Certificates** (*Always Use HTTPS* on, *Minimum TLS Version* 1.2, *Automatic HTTPS Rewrites* on).
- Custom domain: Pages → gracechords → Custom domains shows `gracechords.com` as **Active**. `old.gracechords.com` is the archived GitHub Pages site and is unrelated.

**Test**
- Run `npm run smoke:prod -w @gracechords/web` and expect all checks to pass.
- Crash report end to end, after deploy and after applying the migration: in the production site's DevTools console, run `setTimeout(() => { throw new Error('crash-report test') })`, then refresh `client_errors`. A row with that message should appear, and running it again bumps `count`. Delete the row afterwards.
- Analytics: visit the site, then check Web Analytics after a few minutes.

**Troubleshooting**
- *No row in `client_errors`:* check the function's real-time logs. If `[client-error] store failed 404` appears, the migration isn't applied. A `401` means `SUPABASE_SERVICE_ROLE_KEY` is missing on the Pages **Production** environment. No `[client-error]` line at all means the browser never sent the report. Reports only come from production builds, and the error may be a skipped kind (chunk-load or extension).
- *A table full of junk:* someone is posting fake reports. Check that the WAF rule is deployed, then `delete from client_errors where first_seen > '<time>'`.
- *Smoke test fails on "crash-report endpoint" with 405:* the function isn't deployed. The build probably failed, so check Pages → Deployments.
- *Certificate check fails:* see SSL/TLS → Edge Certificates. A stuck renewal is usually a CAA DNS record that excludes the issuing CA.

---

## Final production checklist

**Before merging**
- [ ] `npm test` passes and `npm run lint` is clean
- [ ] `npm run i18n:check` passes; new non-English strings carry `needsReview: true`
- [ ] `npm run build` succeeds locally or on the Preview deploy
- [ ] Preview deploy loads Home, Songs, a song, Setlist, Songbook, Daily Word and `/definitely-not-a-page`
- [ ] Sign-in (email, Google, Apple) works on the Preview, if its URL is in Supabase Redirect URLs
- [ ] Any new migration was applied by hand and RLS was tested with a `user`-role account

**One-time platform setup**
- [ ] Cloudflare Pages Production **and** Preview variables match the table in §1
- [ ] `VITE_COMMIT_SHA` set on the Pages build
- [x] SSL/TLS: Always Use HTTPS and Minimum TLS 1.2 (verified 2026-11-05)
- [ ] WAF rate-limiting rule on `/api/client-error`
- [x] Web Analytics enabled on the Pages project
- [ ] `client_errors` migration applied in Supabase
- [ ] Supabase Site URL and Redirect URLs set for gracechords.com
- [ ] Apple Services ID set in Supabase, and the `Rotate Sign in with Apple secret` workflow's secrets added and run once
- [ ] Supabase: Secure password change ON, Allow manual linking ON, custom SMTP registered with Apple's private relay
- [ ] Google Search Console property verified and sitemap submitted

**After each deploy**
- [ ] "Production smoke test" workflow is green (or run `npm run smoke:prod`)
- [ ] Hard-refresh and spot-check the changed feature
- [ ] No new or climbing rows in `client_errors` (sort by `last_seen`)
