# Contributing

We welcome fixes and new songs. Start with [[Getting-Started]] and [[Project-Structure]].

## Workflow
1. Create a feature branch
2. Run tests
   ```bash
   npm test
   ```
3. Commit with clear messages and open a pull request

## Coding Standards
- Prefer functional React components
- Run Prettier or ESLint if available in your editor
- Keep `docs/CNAME` and built assets out of commits unless needed

## Wiki Sync
`node scripts/syncWiki.mjs` pushes `docs/wiki` to `GraceChords.wiki`. Set a `WIKI_PUSH_TOKEN` (fine-grained PAT with wiki write access) as an environment variable or repository secret.

Thanks for contributing!
