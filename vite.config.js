import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  base: '',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [{ src: 'src/sw.js', dest: '' }]
    })
  ],
  build: { outDir: 'docs', chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'happy-dom',
    setupFiles: './src/setupTests.js',
    globals: true
  }
})
