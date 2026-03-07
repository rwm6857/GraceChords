Set up a local environment to develop or preview GraceChords.

## Prerequisites
- [Node.js LTS](https://nodejs.org/)
- Git
- A Supabase project (for auth and song data)

## Install and run
```bash
npm ci
npm run dev
```
The app uses Vite with BrowserRouter plus prebuilt shell pages and a 404 redirect so deep links work on GitHub Pages.

## Environment variables

Create a `.env` file at the repo root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_PW=your-editor-password        # legacy password gate (used by ingest CLI)
VITE_ENABLE_DISCLAIMER=1                  # set to 0 to hide footer/PDF disclaimers
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required — the app cannot load songs or authenticate users without them. Find these values in your Supabase project settings under **API**.

Add the same variables as repository secrets/variables for CI/CD deploys.

## Supabase setup

Apply all migrations under `supabase/migrations/` in order to create the required tables (`users`, `songs`, `user_starred_songs`, `saved_sets`, `collaborator_requests`). See [[Project-Structure]] for the full migration list.

## Build for deployment
```bash
npm run build
```
The build outputs to `docs/` for GitHub Pages; ensure a `CNAME` file is present for custom domains.

[[Project-Structure]] [[Roles-and-Access]]
