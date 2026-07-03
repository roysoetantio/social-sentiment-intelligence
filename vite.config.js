import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import ingestApiPlugin from './vite-plugin-ingest-api.js'

export default defineConfig({
  plugins: [react(), ingestApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  optimizeDeps: {
    include: [
      'sentiment',
      '@supabase/supabase-js',
      'react',
      'react-dom',
      'react-router-dom',
      'date-fns',
      'recharts',
      'lucide-react',
      'clsx',
      'uuid',
    ],
  },
  server: {
    // Honor a PORT env var when provided (e.g. preview harness); otherwise Vite's default.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    allowedHosts: 'all',
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
    warmup: {
      clientFiles: [
        './src/main.jsx',
        './src/App.jsx',
        './src/context/DashboardContext.jsx',
        './src/components/layout/Layout.jsx',
        './src/pages/Overview.jsx',
      ],
    },
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
