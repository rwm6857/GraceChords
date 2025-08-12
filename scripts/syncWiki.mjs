#!/usr/bin/env node
/**
 * Sync Markdown/wiki assets from public/wiki/ to the repo's GitHub Wiki.
 * - No-op (exit 0) if public/wiki/ doesn't exist or is empty.
 * - Dry-run (exit 0) if WIKI_PUSH_TOKEN is not provided.
 * - Copies ALL files (including images) recursively.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(_execFile);

async function dirExists(p) {
  try { return (await fs.stat(p)).isDirectory(); } catch { return false; }
}

async function ensuredTmpDir(prefix = "wiki-sync-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cpRecursive(src, dest) {
  // Node 18+ has fs.cp; Node 20 used by GH Actions has it too.
  // Copy everything except .git
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });
  await Promise.all(entries.map(async (ent) => {
    if (ent.name === ".git") return;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      await cpRecursive(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }));
}

function repoSlug() {
  // e.g., "rwm6857/GraceChords"
  return process.env.GITHUB_REPOSITORY || "";
}

async function currentBranch(repoDir) {
  try {
    const { stdout } = await execFile("git", ["-C", repoDir, "rev-parse", "--abbrev-ref", "HEAD"]);
    const b = stdout.trim();
    return b || "master"; // Wikis usually default to 'master'
  } catch {
    return "master";
  }
}

(async () => {
  const root = process.cwd();
  const srcDir = path.join(root, "public", "wiki");

  if (!(await dirExists(srcDir))) {
    console.log(`[wiki-sync] No wiki source at ${srcDir}. Nothing to do.`);
    process.exit(0);
  }

  const visible = (await fs.readdir(srcDir)).filter((n) => !n.startsWith("."));
  if (visible.length === 0) {
    console.log("[wiki-sync] public/wiki is empty. Nothing to do.");
    process.exit(0);
  }

  const slug = repoSlug();
  if (!slug) {
    console.log("[wiki-sync] GITHUB_REPOSITORY env not set. Running locally? Skipping.");
    process.exit(0);
  }

  const token = process.env.WIKI_PUSH_TOKEN || "";
  const wikiHttps = token
    ? `https://${token}@github.com/${slug}.wiki.git`
    : `https://github.com/${slug}.wiki.git`;

  const tmp = await ensuredTmpDir("gracechords-wiki-");
  console.log(`[wiki-sync] Cloning wiki to ${tmp} ...`);
  await execFile("git", ["clone", "--depth=1", wikiHttps, tmp]);

  // Copy files into the wiki repo
  await cpRecursive(srcDir, tmp);

  // Stage and detect changes
  await execFile("git", ["-C", tmp, "add", "--all"]);
  const { stdout: status } = await execFile("git", ["-C", tmp, "status", "--porcelain"]);
  if (!status.trim()) {
    console.log("[wiki-sync] No changes to commit.");
    process.exit(0);
  }

  // Identify branch ('master' on most wiki repos)
  const branch = await currentBranch(tmp);

  // Configure author
  await execFile("git", ["-C", tmp, "config", "user.name", "github-actions[bot]"]);
  await execFile("git", ["-C", tmp, "config", "user.email", "github-actions[bot]@users.noreply.github.com"]);

  if (!token) {
    console.log("[wiki-sync] DRY RUN (no WIKI_PUSH_TOKEN set). Detected changes:\n" + status);
    console.log("[wiki-sync] Provide WIKI_PUSH_TOKEN to enable pushing to the wiki repo.");
    process.exit(0);
  }

  await execFile("git", ["-C", tmp, "commit", "-m", "Sync from public/wiki"]);
  await execFile("git", ["-C", tmp, "push", "origin", `HEAD:${branch}`]);

  console.log("[wiki-sync] Done.");
})().catch((err) => {
  console.error("[wiki-sync] ERROR:", err?.stack || err?.message || String(err));
  // Don't fail the pipeline on a wiki hiccup by default — change to 1 if you want hard failures.
  process.exit(0);
});
