#!/usr/bin/env node
/*
 * Diagnostic script for GitHub Wiki syncing.
 * Checks wiki source presence, token, and remote repo accessibility.
 * Always exits 0.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(_execFile);

function log(status, message) {
  console.log(`[${status}] ${message}`);
}

(async () => {
  const root = process.cwd();
  const wikiDir = path.join(root, 'public', 'wiki');
  let hasWiki = false;
  try {
    const entries = await fs.readdir(wikiDir);
    if (entries.includes('Home.md') && entries.includes('_Sidebar.md')) {
      hasWiki = true;
    }
  } catch {}
  if (hasWiki) {
    log('PASS', 'public/wiki contains Home.md and _Sidebar.md');
  } else {
    log('FAIL', 'public/wiki missing or lacks Home.md/_Sidebar.md');
  }

  async function repoSlug() {
    if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
    try {
      const { stdout } = await execFile('git', ['config', '--get', 'remote.origin.url']);
      const m = stdout.trim().match(/github\.com[:/](.+?)(\.git)?$/);
      if (m) return m[1];
    } catch {}
    return path.basename(root);
  }

  const slug = await repoSlug();
  const wikiRepo = `https://github.com/${slug}.wiki.git`;
  log('INFO', `Wiki repo URL: ${wikiRepo}`);

  let wikiEnabled = false;
  try {
    await execFile('git', ['ls-remote', wikiRepo], { stdio: 'ignore' });
    wikiEnabled = true;
  } catch {
    wikiEnabled = false;
  }
  if (wikiEnabled) {
    log('PASS', 'Repository wiki appears to be enabled');
  } else {
    log('FAIL', 'Wiki repo not reachable. Enable it in GitHub Settings > General > Features > Wiki');
  }

  if (process.env.WIKI_PUSH_TOKEN) {
    log('PASS', 'WIKI_PUSH_TOKEN is set');
  } else {
    log('FAIL', 'WIKI_PUSH_TOKEN not set; sync will run in DRY RUN mode');
  }

  console.log('Run: node scripts/syncWiki.mjs to perform the sync (DRY RUN without WIKI_PUSH_TOKEN).');
})().catch((err) => {
  console.error(err);
}).finally(() => {
  process.exit(0);
});
