import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// The E2E suite talks to the local Supabase stack only. `.env.e2e` keeps those
// values away from `.env`, which points at the hosted project.
if (existsSync('.env.e2e')) process.loadEnvFile('.env.e2e')

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || ''

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/seed.js',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
    },
  },
})
