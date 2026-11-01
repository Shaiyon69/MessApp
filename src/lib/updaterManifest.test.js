import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { buildManifest } from '../../scripts/updater-manifest.mjs'

test('maps signed artifacts to Skibidevs release URLs and skips missing platforms', () => {
  const files = { [join('out', 'MessApp-Windows-v1.2.0.sig')]: 'SIG\n' }
  const manifest = buildManifest({
    dir: 'out',
    version: '1.2.0',
    pubDate: '2026-10-30T00:00:00Z',
    exists: (p) => p in files,
    read: (p) => files[p]
  })
  assert.deepEqual(manifest, {
    version: '1.2.0',
    pub_date: '2026-10-30T00:00:00Z',
    platforms: {
      'windows-x86_64': {
        signature: 'SIG',
        url: 'https://github.com/Shaiyon69/Skibidevs/releases/download/messapp-v1.2.0/MessApp-Windows-v1.2.0.exe'
      }
    }
  })
  assert.throws(() => buildManifest({ dir: 'out', version: '9.9.9', exists: () => false }))
})
