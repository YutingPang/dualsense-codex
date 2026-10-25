import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: 'desktop/renderer',
  // Packaged Electron windows load this document via file://, so renderer
  // assets must resolve relative to the generated index.html.
  base: './',
  build: {
    outDir: `${projectRoot}.vite/renderer/main_window`,
  },
  plugins: [react()],
})
