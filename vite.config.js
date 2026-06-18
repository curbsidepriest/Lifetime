import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
