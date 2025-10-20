Set up a local environment to develop or preview GraceChords.

## Prerequisites
- [Node.js LTS](https://nodejs.org/)
- Git

## Install and run
```bash
npm ci
npm run dev
```
The app uses Vite with a HashRouter, so routing works on GitHub Pages.

Environment
- Create a local `.env` with `VITE_ADMIN_PW=your-password` to enable the Admin tools.

## Build for deployment
```bash
npm run build
```
The build outputs to `docs/` for GitHub Pages; ensure a `CNAME` file is present for custom domains.

[[Project-Structure]]
