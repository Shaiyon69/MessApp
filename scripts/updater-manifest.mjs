// Builds the tauri-plugin-updater latest.json from the signed CI artifacts.
// Usage: node scripts/updater-manifest.mjs <artifacts-dir> <version> > latest.json
// The installers are published on the public Skibidevs release `messapp-v<version>`.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLATFORMS = [
  { key: 'windows-x86_64', name: 'Windows', ext: 'exe' },
  { key: 'linux-x86_64', name: 'Linux', ext: 'AppImage' }
]

export function buildManifest({ dir, version, pubDate = new Date().toISOString(), read = readFileSync, exists = existsSync }) {
  const base = `https://github.com/Shaiyon69/Skibidevs/releases/download/messapp-v${version}`
  const platforms = {}
  for (const { key, name, ext } of PLATFORMS) {
    const sig = join(dir, `MessApp-${name}-v${version}.sig`)
    if (!exists(sig)) continue
    platforms[key] = { signature: read(sig, 'utf8').trim(), url: `${base}/MessApp-${name}-v${version}.${ext}` }
  }
  if (!Object.keys(platforms).length) throw new Error(`No .sig files for v${version} in ${dir}`)
  return { version, pub_date: pubDate, platforms }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, version] = process.argv.slice(2)
  process.stdout.write(JSON.stringify(buildManifest({ dir, version }), null, 2) + '\n')
}
