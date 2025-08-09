import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: set base to '/<your-repo>/' before deploying to GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: '/GraceChords/',
  build: {
    outDir: 'docs' // <-- this makes build output go straight to docs/
  }
})
