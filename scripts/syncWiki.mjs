import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

const token = process.env.WIKI_PUSH_TOKEN
const repoUrl = token
  ? `https://${token}@github.com/rwm6857/GraceChords.wiki.git`
  : 'https://github.com/rwm6857/GraceChords.wiki.git'
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gracechords-wiki-'))

execSync(`git clone ${repoUrl} ${tmp}`, { stdio: 'inherit' })

const srcDir = path.join(process.cwd(), 'public', 'wiki')
const files = (await fs.readdir(srcDir)).filter(f => f.endsWith('.md'))
for (const file of files) {
  await fs.copyFile(path.join(srcDir, file), path.join(tmp, file))
}

if (!token) {
  console.log('WIKI_PUSH_TOKEN not set; dry run. Files to sync:')
  files.forEach(f => console.log(' -', f))
  process.exit(0)
}

execSync('git config user.name "wiki-sync"', { cwd: tmp })
execSync('git config user.email "actions@users.noreply.github.com"', { cwd: tmp })
execSync('git add .', { cwd: tmp })
try {
  execSync('git commit -m "Sync wiki"', { cwd: tmp, stdio: 'inherit' })
  execSync('git push', { cwd: tmp, stdio: 'inherit' })
} catch (e) {
  console.log('No wiki changes to commit')
}
