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
  build: {
    rollupOptions: {
      output: {
        // Split ONLY the heavy, self-contained web3 stack into its own chunk.
        // Everything else (React, React-Query, router, app) stays together —
        // splitting React/query into separate chunks broke load order and
        // white-screened the site with "createContext undefined" (the query
        // chunk evaluated before React was available). web3 has no such
        // cross-dependency on app init, so it's safe to isolate + cache.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](wagmi|viem|@rainbow-me|@walletconnect|@coinbase|@metamask|ox)[\\/]/.test(id)) return 'web3'
          return
        },
      },
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
