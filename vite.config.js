import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
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
    })
  ],
  build: { outDir: 'docs', chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'happy-dom',
    setupFiles: './src/setupTests.js',
    globals: true
  }
})
