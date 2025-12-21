import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  // Set base to "./" if assets fail on GH Pages
  base: '',
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
  build: { outDir: 'docs', chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'happy-dom',
    setupFiles: './src/setupTests.js',
    globals: true
  }
})
