import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    base: globalThis.process?.env?.VITE_BASE_PATH || './',
    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
    },
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
  }
})
