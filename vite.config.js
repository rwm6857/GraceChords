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
    process.env.ANALYZE ? visualizer({ filename: 'dist/stats.html', template: 'treemap' }) : null
  ],
  // In local dev, proxy /bible/* and /pptx/* to the R2 CDN so the Pages Function path is simulated.
  // Set VITE_R2_PUBLIC_URL in .env.local to enable this (e.g. https://assets.gracechords.com).
  server: process.env.VITE_R2_PUBLIC_URL
    ? {
        proxy: {
          '/bible': {
            target: process.env.VITE_R2_PUBLIC_URL,
            changeOrigin: true,
          },
        },
      }
    : {},
  build: {
    outDir: 'dist',
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
