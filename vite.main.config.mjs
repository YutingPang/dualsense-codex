import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'node-hid'],
      output: { entryFileNames: 'main.cjs' },
    },
  },
})
