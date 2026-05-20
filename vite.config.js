import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ingestApiPlugin from './vite-plugin-ingest-api.js'

export default defineConfig({
  plugins: [react(), ingestApiPlugin()],
  optimizeDeps: {
    include: ['sentiment'],
  },
  server: {
    proxy: {
      // Proxy NewsAPI calls to avoid CORS on free tier
      '/newsapi': {
        target: 'https://newsapi.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/newsapi/, ''),
      },
    },
  },
})
