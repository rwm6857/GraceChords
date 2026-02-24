import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { visualizer } from 'rollup-plugin-visualizer'

const SW_VERSION = process.env.VITE_COMMIT_SHA || new Date().toISOString()

export default defineConfig({
  // Keep assets rooted at the site origin for absolute public paths.
  base: '/',
  define: {
    __SW_VERSION__: JSON.stringify(SW_VERSION),
  },
  plugins: [
    react({
      // Make the React plugin handle .js files too (not just .jsx/.tsx)
      include: [/\.jsx?$/, /\.tsx?$/], // includes .js, .jsx, .ts, .tsx
      jsxRuntime: 'automatic',
    }),
    viteStaticCopy({
      targets: [
        { src: 'src/sw.js', dest: '' },
        { src: '404.html', dest: '' }
      ]
    }),
    // Enable bundle analysis with ANALYZE=1 to find unused JS and split chunks safely
    process.env.ANALYZE ? visualizer({ filename: 'docs/stats.html', template: 'treemap' }) : null
  ],
  build: {
    outDir: 'docs',
    // Keep previous hashed assets so stale cached HTML can still load CSS/JS.
    // This is important when a CDN caches HTML longer than expected.
    emptyOutDir: false,
    chunkSizeWarningLimit: 1200
  },
  test: {
    environment: 'happy-dom',
    setupFiles: './src/setupTests.js',
    globals: true
  }
})
