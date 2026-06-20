import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Dev API target. Defaults to the local backend; override with
        // VITE_DEV_API_TARGET to point at a remote (e.g. the live tailnet API)
        // without touching this file. Production uses the same-origin /api
        // rewrite in vercel.json, not this proxy.
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
