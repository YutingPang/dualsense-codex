import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: 'desktop/renderer',
  build: {
    outDir: `${projectRoot}.vite/renderer/main_window`,
  },
  plugins: [react()],
})
