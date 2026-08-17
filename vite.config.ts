import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerPlugin } from './vite-plugin-sw'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  resolve: {
    alias: {
      '@balance': fileURLToPath(new URL('./src/balance', import.meta.url)),
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
      '@editor': fileURLToPath(new URL('./src/editor', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  // Keep each raster mark as a real emitted file. Inlining the small neutral
  // cards into the JS bundle makes the browser work, but removes them from the
  // service worker's image inventory and makes offline cache failures opaque.
  build: {
    assetsInlineLimit: 0,
  },
})
