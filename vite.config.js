import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ingestApiPlugin from './vite-plugin-ingest-api.js'

export default defineConfig({
  plugins: [react(), ingestApiPlugin()],
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
