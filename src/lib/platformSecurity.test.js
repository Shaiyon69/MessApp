import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const readText = path => readFile(new URL(path, import.meta.url), 'utf8')

describe('platform security configuration', () => {
  it('sets defensive headers for every Vercel route', async () => {
    const config = await readJson('../../vercel.json')
    const route = config.headers?.find(item => item.source === '/(.*)')
    const headers = Object.fromEntries((route?.headers || []).map(({ key, value }) => [key, value]))

    assert.match(headers['Content-Security-Policy'], /object-src 'none'/)
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/)
    assert.match(headers['Content-Security-Policy'], /connect-src[^;]*https:\/\/\*\.supabase\.co/)
    assert.equal(headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(headers['X-Frame-Options'], 'DENY')
    assert.equal(headers['Referrer-Policy'], 'no-referrer')
  })

  it('enables a Tauri CSP while preserving its IPC boundary', async () => {
    const config = await readJson('../../src-tauri/tauri.conf.json')
    const security = config.app?.security || {}

    assert.notEqual(security.csp, null)
    assert.match(security.csp?.['connect-src'] || '', /\bipc:/)
    assert.match(security.csp?.['connect-src'] || '', /http:\/\/ipc\.localhost/)
    assert.equal(security.csp?.['object-src'], "'none'")
    assert.equal(security.headers?.['X-Content-Type-Options'], 'nosniff')
  })

  it('prevents Android from backing up persistent auth and key data', async () => {
    const manifest = await readText('../../android/app/src/main/AndroidManifest.xml')

    assert.match(manifest, /android:allowBackup="false"/)
    assert.match(manifest, /android:fullBackupContent="false"/)
    assert.doesNotMatch(manifest, /android:usesCleartextTraffic="true"/)
  })

  it('strips console and debugger statements from production bundles', async () => {
    const config = await readText('../../vite.config.js')
    const diagnostics = await readText('./debug.js')

    assert.match(config, /drop:\s*isProduction\s*\?\s*\['console',\s*'debugger'\]/)
    assert.match(diagnostics, /if\s*\(import\.meta\.env\?\.PROD\)\s*return false/)
    assert.doesNotMatch(diagnostics, /messappDebug'\)\s*===\s*'true'/)
  })
})
