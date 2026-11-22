import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  server: { proxy: { '/hardware-bridge': { target: 'http://127.0.0.1:8787', rewrite: path => path.replace(/^\/hardware-bridge/, '') }, '/api': { target: process.env.BACKEND_URL || 'http://localhost:8080', changeOrigin: true } } },
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
