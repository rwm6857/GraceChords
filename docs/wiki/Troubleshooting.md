# Troubleshooting

Common snags and quick fixes.

## GitHub Pages 404
Ensure the app uses a HashRouter and links start with `/#/`. A missing hash leads to 404s.

## CNAME Disappearing
GitHub Pages may erase `docs/CNAME` on force pushes. Restore the file and push again.

## Fonts Not Embedding
Confirm `docs/fonts/` exists after `npm run build`. Browsers may block cross-origin fonts.

## PDF Page Splits
Long sections might force a new page. Use `{comment: repeat}` or break the section.

## Missing PPTX
Place files under `public/pptx/` with the song slug. [[Slides-(PPTX)]] explains the naming.
