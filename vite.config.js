import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: globalThis.process?.env?.VITE_BASE_PATH || './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    watch: {
      ignored: [
        '**/android/**',
        '**/ios/**',
        '**/src-tauri/**',
        '**/.git/**',
      ],
    },
  },
})
