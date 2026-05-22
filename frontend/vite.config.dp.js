import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: 'index-dp.html',
    },
    outDir: 'dist-dp',
  },
  preview: {
    port: parseInt(process.env.PORT) || 4173,
    host: true,
    allowedHosts: 'all',
  },
})
