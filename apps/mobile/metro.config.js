// Metro config for the npm-workspaces monorepo.
//
// This is the load-bearing step: @gracechords/core is consumed as TypeScript
// SOURCE with no build step (its package.json `main` points at src/index.ts),
// so Metro must (a) watch the repo root to see packages/core, and (b) know to
// look in both the app's node_modules and the hoisted root node_modules.
// Metro transpiles everything it bundles through babel-preset-expo, which
// handles the .ts/.tsx source in core — no separate compile is needed.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 1. Watch the whole monorepo so edits in packages/core hot-reload.
config.watchFolders = [workspaceRoot]

// 2. Resolve from the app first, then fall back to the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
