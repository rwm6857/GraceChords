import { defineConfig } from 'vitest/config'

// Headless harness for the pure auth/profile logic in src/lib. Screens, route
// files, authDeps.ts, and sprites.ts import native/asset code and are covered
// by the device-test checklist instead.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // devotionalSource.test.ts reads generated, untracked content artifacts at
    // module scope; without this the suite fails on a fresh clone. See the file.
    globalSetup: ['./vitest.globalSetup.ts'],
  },
})
