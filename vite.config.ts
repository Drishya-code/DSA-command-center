import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so dist/ works on any host/subpath (GitHub Pages project sites, file://, Capacitor).
  base: './',
  plugins: [react(), tailwindcss()],
  // Rust build artifacts are locked while compiling; keep Vite's watcher out of them.
  server: {
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
