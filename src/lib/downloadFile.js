import { Capacitor } from '@capacitor/core'
import { debug } from './debug.js'

/**
 * Saving an attachment is not just "point an anchor at the URL": the `download`
 * attribute is ignored for cross-origin hrefs (every Supabase Storage file), and
 * Android's WebView never acts on it at all. This module is the single place that
 * knows how each shell actually saves a file.
 */

/** Best-effort file name: the stored name, else the last URL path segment. */
export const resolveDownloadName = (url, fileName) => {
  const named = (fileName || '').trim()
  if (named) return named
  if (url.startsWith('data:')) return 'download'
  try {
    const path = new URL(url, 'https://local.invalid').pathname
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() || '')
    if (last) return last
  } catch {
    // Blob URLs carry no useful path; fall through to the generic name.
  }
  return 'download'
}

/**
 * Android's DownloadListener only receives a URL string, so the file name rides
 * along in the fragment (never sent to the server) and data URLs are forced to
 * octet-stream so the WebView treats them as a download instead of rendering them.
 */
export const toAndroidDownloadUrl = (url, name) => {
  const tagged = url.startsWith('data:')
    ? url.replace(/^data:[^;,]*/, 'data:application/octet-stream')
    : url
  return `${tagged.split('#')[0]}#${encodeURIComponent(name)}`
}

/**
 * Supabase Storage sets a Content-Disposition attachment header when asked.
 * Without it Android's WebView renders an image or video inline instead of
 * handing the URL to the DownloadListener, so the save never happens.
 */
export const toAttachmentUrl = (url, name) => {
  if (!/^https?:/i.test(url)) return url
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('download', name)
    return parsed.toString()
  } catch {
    return url
  }
}

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error || new Error('Could not read file'))
  reader.readAsDataURL(blob)
})

const clickAnchor = (href, name) => {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/**
 * Downloads `url` as `fileName`. Decrypted DM media arrives as a blob URL and is
 * saved directly; remote files are fetched first so the save runs from a
 * same-origin blob URL that browsers honour.
 */
export async function downloadFile(url, fileName, {
  isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
} = {}) {
  if (!url) throw new Error('Nothing to download')
  const name = resolveDownloadName(url, fileName)
  const isBlob = url.startsWith('blob:')

  if (isAndroid) {
    if (isBlob || url.startsWith('data:')) {
      // Decrypted DM media never touches the network, and the WebView blocks
      // top-level data: navigation, so it cannot reach the DownloadListener.
      // MainActivity exposes the same native saver directly instead.
      // ponytail: the file crosses to native as one base64 string, so a very
      // large video doubles in memory. Swap in a file bridge if that ever bites.
      const dataUrl = isBlob ? await readAsDataUrl(await (await fetch(url)).blob()) : url
      if (!window.MessAppDownloads?.save) throw new Error('This build cannot save decrypted media')
      window.MessAppDownloads.save(toAndroidDownloadUrl(dataUrl, name))
      return name
    }
    window.location.href = toAndroidDownloadUrl(toAttachmentUrl(url, name), name)
    return name
  }

  if (isBlob) {
    clickAnchor(url, name)
    return name
  }

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed (${response.status})`)
    const objectUrl = URL.createObjectURL(await response.blob())
    clickAnchor(objectUrl, name)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
  } catch (error) {
    // A blocked fetch (CORS, offline) still leaves the file reachable in a tab.
    debug.warn('ATTACHMENT_DOWNLOAD_FALLBACK', { error })
    window.open(url, '_blank', 'noopener')
  }
  return name
}
