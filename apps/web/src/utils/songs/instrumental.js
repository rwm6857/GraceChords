// Compatibility shim — re-exports from @gracechords/core. Do not add logic here.
// The implementation moved to packages/core/src/songs/instrumental.
// Extension is required: the Cloudflare Pages Functions bundler resolves the
// core package's `"./*": "./src/*"` exports map literally (no extension
// guessing), and this shim is in the /api/export/song function's import chain.
export * from '@gracechords/core/songs/instrumental.js'
