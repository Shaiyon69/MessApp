/* Runtime half of the Liquid Glass style: refraction (Chromium only). Each
   glass surface gets its own SVG filter, a displacement map sized to it
   (liquidGlassMap.js) applied through backdrop-filter: url(). WebKit and
   Firefox ignore url() in backdrop-filter, so they keep the CSS-only clear
   glass.
   Everything is driven by attributes on <html> (data-ui-style,
   data-glass-refraction, data-glass-perf), so React never has to know about it.
   data-glass-perf="lite" (phones, low-end machines) turns refraction off and
   lets glass.css drop most backdrop filters. */
import { buildGlassMap } from './liquidGlassMap.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MAX_SIDE = 1400
const MAX_TRACKED = 80
const MAX_FILTERS = 40
const DISPERSION = 0.11

export const GLASS_SURFACE_SELECTOR = [
  '.premium-menu', '.premium-modal', '.ios-sheet', '.premium-composer',
  '.origin-dots', '.quick-action', '.quick-action-trigger', '.dock',
  '.premium-button', '.premium-secondary-button', '.premium-icon-button',
  '.premium-card', '.premium-section', '.glass-panel', '.app-toast',
  '.ios-glass-sidebar', '.app-left-panel', '.right-sidebar-panel',
  '.chat-surface', '.home-tab-shell', '.appearance-tint-option', '.glass-surface',
  '.chat-glass', '.chat-glass .composer-field',
  // Every tab, not just the active one: switching tabs is an attribute change,
  // which the childList observer never sees, so the map must already exist.
  '.dock .m3-nav-item', '.dock .m3-nav-indicator'
].join(',')

// Refract without dispersion: one displacement pass, so the edge keeps the palette's single hue.
const MONO_SELECTOR = '.menu-glass, .dock, .dock *, .chat-glass, .chat-glass *'

// The half-screen sheet is too large for the size-based lens, which leaves its
// body clear; force one so the whole sheet bends what is behind it.
const LENS_SELECTOR = '.ios-sheet.menu-glass'
const SHEET_LENS = 2.5

// Overlays open on top of a full screen, so they take tracking slots first.
const OVERLAY_SELECTOR = '.ios-sheet, .premium-modal, .premium-menu'

const CHANNELS = [
  { matrix: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', spread: 1 + DISPERSION },
  { matrix: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', spread: 1 },
  { matrix: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', spread: 1 - DISPERSION }
]

export function isChromium() {
  if (typeof navigator === 'undefined') return false
  const brands = navigator.userAgentData?.brands
  if (brands?.length) return brands.some(({ brand }) => /Chromium/i.test(brand))
  // iOS Chrome reports CriOS and runs WebKit, so it fails this on purpose.
  return /Chrome\/\d/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent)
}

/* Three displacements with slightly different strengths, one per colour
   channel, recombined: the shader's dispersion. Screen equals a sum here
   because the channels are disjoint; Chromium's arithmetic feComposite
   dropped the backdrop instead. */
export function filterMarkup(id, width, height, href, scale, mono = false) {
  const open = `<filter id="${id}" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
    <feImage href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>`
  if (mono) {
    return `${open}
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale.toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`
  }
  const passes = CHANNELS.map(({ matrix, spread }, index) => `
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${(scale * spread).toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="d${index}"/>
    <feColorMatrix in="d${index}" type="matrix" values="${matrix}" result="c${index}"/>`).join('')

  return `${open}${passes}
    <feBlend in="c0" in2="c1" mode="screen" result="rg"/>
    <feBlend in="rg" in2="c2" mode="screen"/>
  </filter>`
}

/* Phones and low-end machines: refraction and dozens of live backdrop
   filters cost more GPU than they can spare. deviceMemory and Save-Data are
   Chromium-only; elsewhere the core count and pointer decide. */
export function isLowPowerDevice(nav = globalThis.navigator, matchMedia = globalThis.matchMedia) {
  if (!nav) return false
  if (matchMedia?.('(pointer: coarse)').matches) return true
  if (nav.connection?.saveData) return true
  return (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 4
}

let started = false

export function startLiquidGlass() {
  if (started || typeof document === 'undefined') return
  started = true

  const root = document.documentElement
  const chromium = isChromium()
  const lite = isLowPowerDevice()
  root.dataset.glassPerf = lite ? 'lite' : 'full'
  const filters = new Map()
  const tracked = new Map()
  let defs = null
  let resizeObserver = null
  let domObserver = null
  let scanQueued = false
  let refracting = false

  const ensureDefs = () => {
    if (defs) return defs
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    svg.style.pointerEvents = 'none'
    defs = document.createElementNS(SVG_NS, 'defs')
    svg.appendChild(defs)
    document.body.appendChild(svg)
    return defs
  }

  const evict = () => {
    for (const [key, entry] of filters) {
      if (filters.size <= MAX_FILTERS) return
      if (entry.users.size) continue
      entry.node.remove()
      filters.delete(key)
    }
  }

  const acquire = (element, width, height, radius, mono, lens) => {
    const key = `${width}x${height}r${radius}${mono ? 'm' : ''}${lens ? `l${lens}` : ''}`
    let entry = filters.get(key)
    if (entry) {
      // Re-insert so Map order doubles as least-recently-used order.
      filters.delete(key)
    } else {
      const map = buildGlassMap(width, height, radius, lens)
      const canvas = document.createElement('canvas')
      canvas.width = map.width
      canvas.height = map.height
      canvas.getContext('2d').putImageData(new ImageData(map.data, map.width, map.height), 0, 0)
      const holder = document.createElementNS(SVG_NS, 'g')
      holder.innerHTML = filterMarkup(`lg-${key}`, map.width, map.height, canvas.toDataURL(), map.scale, mono)
      const node = holder.firstElementChild
      ensureDefs().appendChild(node)
      entry = { node, users: new Set() }
    }
    filters.set(key, entry)
    entry.users.add(element)
    evict()
    return key
  }

  const release = (element) => {
    const key = tracked.get(element)
    if (key) filters.get(key)?.users.delete(element)
    tracked.set(element, null)
  }

  const untrack = (element) => {
    release(element)
    tracked.delete(element)
    resizeObserver?.unobserve(element)
    element.style.removeProperty('--lg-refract')
  }

  const onResize = (entries) => {
    for (const entry of entries) {
      const element = entry.target
      const box = entry.borderBoxSize?.[0]
      const width = Math.round(box ? box.inlineSize : element.offsetWidth)
      const height = Math.round(box ? box.blockSize : element.offsetHeight)
      release(element)
      if (width < 8 || height < 8 || width > MAX_SIDE || height > MAX_SIDE) {
        element.style.removeProperty('--lg-refract')
        continue
      }
      const radius = Math.round(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0)
      const key = acquire(element, width, height, radius, element.matches(MONO_SELECTOR), element.matches(LENS_SELECTOR) ? SHEET_LENS : undefined)
      tracked.set(element, key)
      element.style.setProperty('--lg-refract', `url(#lg-${key})`)
    }
  }

  const scan = () => {
    scanQueued = false
    if (!refracting) return
    for (const element of [...tracked.keys()]) {
      if (!element.isConnected) untrack(element)
    }
    // Bubbles never refract: the bezel bent the edge into a reflection
    // under each one (glass.css keeps their frost).
    const found = [...document.querySelectorAll(GLASS_SURFACE_SELECTOR)].filter((element) => !element.matches('.chat-bubble'))
    const overlays = found.filter((element) => element.matches(OVERLAY_SELECTOR))
    const rest = found.filter((element) => !element.matches(OVERLAY_SELECTOR))
    for (const element of [...overlays, ...rest]) {
      if (tracked.size >= MAX_TRACKED) break
      if (tracked.has(element)) continue
      tracked.set(element, null)
      resizeObserver.observe(element)
    }
  }

  const queueScan = () => {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(scan)
  }

  const startRefraction = () => {
    refracting = true
    resizeObserver = new ResizeObserver(onResize)
    domObserver = new MutationObserver(queueScan)
    domObserver.observe(document.body, { childList: true, subtree: true })
    queueScan()
  }

  const stopRefraction = () => {
    refracting = false
    domObserver?.disconnect()
    resizeObserver?.disconnect()
    for (const element of [...tracked.keys()]) untrack(element)
    for (const { node } of filters.values()) node.remove()
    filters.clear()
  }

  const sync = () => {
    const glass = root.dataset.uiStyle === 'glass'
    const wantRefraction = glass && chromium && !lite && root.dataset.glassRefraction !== 'off'
    if (wantRefraction && !refracting) startRefraction()
    else if (!wantRefraction && refracting) stopRefraction()
  }

  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-ui-style', 'data-glass-refraction'] })
  sync()
}
