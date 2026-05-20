import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/video_feed': 'http://localhost:8000',
    },
  },
  preview: {
    port: parseInt(process.env.PORT) || 4173,
    host: true,
    allowedHosts: 'all',
  },
  build: {
    outDir: 'dist',
  },
})
