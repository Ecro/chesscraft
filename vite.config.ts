import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerPlugin } from './vite-plugin-sw'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
      '@editor': fileURLToPath(new URL('./src/editor', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
})
