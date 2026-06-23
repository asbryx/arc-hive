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
        // Split heavy vendor groups out of the main bundle so the landing
        // page doesn't ship the entire web3 stack up front (audit L1-1:
        // single 1MB chunk). React-Query/router stay with the app; wallet
        // libs (wagmi/viem/rainbowkit) and any charting load as separate
        // cacheable chunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](wagmi|viem|@rainbow-me|@walletconnect|@coinbase|@metamask)[\\/]/.test(id)) return 'web3'
          if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/]@tanstack[\\/]/.test(id)) return 'query'
          return 'vendor'
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
