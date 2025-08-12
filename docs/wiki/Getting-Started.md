# Getting Started

These steps set up a local build of [[GraceChords|Home]].

## Prerequisites
- Node.js 18+
- npm

## Install and Run
```bash
npm i
npm run dev
```
The dev server runs at http://localhost:5173.

## Build for GitHub Pages
```bash
npm run build
```
The production bundle lands in `docs/`. GitHub Pages serves that folder on `main`. Keep `docs/CNAME` so the custom domain persists.

See [[Project-Structure]] for more detail.
