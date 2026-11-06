# Changelog

User-facing changes by release. The app version is the iOS/Android
marketing version (`apps/mobile/app.json`). The website deploys continuously
from `main`, so its changes are listed under the app release they shipped
alongside.

## 1.2.0 — 2026-11-06

Changes since 1.1.3 (released 2026-09-21). 1.1.4 went to TestFlight only.

### iOS and Android app

**New: Setlist Stats**
- See the songs you sing most, the songs new to your sets, what's in heavy
  rotation, and what you haven't sung in a while. Switch between 1 month,
  3 months, 1 year or all time. Open it from the chart button on the Setlists
  tab, or from Settings → Account. It fills in after 10 sets.
- A set counts once you tap Start set and stay with it for a few minutes.
  Recording works offline and survives the app being closed mid-set.
- Your stats are private to you. Clear your history or turn Setlist Stats off
  at any time in Settings → Account. Anonymous feature counts, with no user
  attached, help decide what to build next. The privacy policy covers all of
  it.

**Accounts and sign-in**
- Account → Security: change your password, or set one on an account created
  with Apple or Google.
- A new Sign-in methods screen to connect or disconnect Apple and Google. The
  last way to sign in can't be removed.
- Security: changing someone's role is now checked on the server and is
  limited to admins.

**Live sessions**
- Start a live session from a single song in the Song Viewer, not only from a
  set.
- Followers see "Waiting for the leader…" when nothing is open, a notice when
  the leader disconnects (the last song stays on screen), and a clear
  offline/reconnecting state.
- Backing out of the Performer or Song Viewer no longer ends the session.
  A capsule takes you back to it.

**Updates over the air**
- The app can now receive small fixes without a store update (EAS Update,
  `production` channel). 1.2.0 is the first build that can receive them.

**Fixes**
- Daily Word: one-chapter books (Philemon, 2 John, 3 John, Jude and Obadiah)
  show the whole chapter instead of only verse 1.
- Reader: the Line spacing setting works again in both verse layouts.

### Website (gracechords.com)

- **Setlist Stats:** the full stats page, plus a summary in the saved-setlists
  sidebar.
- **Sign-in:**
  - Continue with Apple on Login and Signup.
  - Profile → Security: change or set a password, and connect or disconnect
    Apple and Google.
  - Stronger password rules.
  - Reset links only work from the recovery email.
- **Profile:** a redesigned page with an avatar icon picker.
- **Performance:**
  - Lighter images and fonts, and a smaller entry bundle.
  - Lyrics load on demand: the song list is about 80% smaller.
  - No more redirect hops on the main pages, and fewer layout shifts.
  - Lighthouse accessibility fixes on the home and song pages.
- **Reliability:**
  - The song catalog retries after a failed load, with a loading state.
  - Crash logging, a proper 404 page, an offline banner and security headers.
  - `/privacy` and `/delete-account` return HTTP 200 (needed for the Google
    Play listing).
  - The canonical URL now matches the URL actually served.
  - The PowerPoint check works behind the Cloudflare cache.
- **Download page:** a Google Play listing on `/download`, and the app banner
  is back.
- **Behind the scenes:**
  - Nightly database backups to R2.
  - The PowerPoint upload worker verifies tokens through Supabase Auth.
  - An editor audit log now exists in production.

### Store release notes ("What's New")

Paste into App Store Connect and the Play Console (under 500 characters, the
Play limit):

> New: Setlist Stats. See the songs you sing most, what's new to your sets,
> and what you haven't sung in a while. Private to you, and you can turn it off
> anytime.
> • Change or set your password, and manage Apple and Google sign-in under
> Account
> • Start a live session from a single song; clearer status for followers
> • Daily Word shows full chapters for one-chapter books, and reader line
> spacing works again
> • Small fixes can now arrive without an app update
