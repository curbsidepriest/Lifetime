import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pin the dev port so localStorage (keyed by origin, i.e. host:port) is stable.
  // strictPort makes Vite fail loudly if 5175 is taken instead of silently
  // moving to another port (which would point at a different, empty data store).
  server: { port: 5175, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        // The app (served at "/")
        main: resolve(__dirname, 'index.html'),
        // The landing page (served at "/landing.html")
        landing: resolve(__dirname, 'landing.html'),
      },
    },
  },
})
