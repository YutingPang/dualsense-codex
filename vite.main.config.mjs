import { defineConfig } from 'vite'

export default defineConfig({
  ssr: {
    // These pure-JS runtime dependencies are not copied into the packaged
    // app's node_modules allowlist, so bundle them into main.cjs. Keep the
    // native HID module and Electron itself external.
    noExternal: ['dualsense-ts', 'zod'],
  },
  build: {
    rollupOptions: {
      external: ['electron', 'node-hid'],
      output: { entryFileNames: 'main.cjs', format: 'cjs' },
    },
  },
})
