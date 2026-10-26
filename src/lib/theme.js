/** Normalizes and applies the persisted document theme mode. */
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export const THEME_MODES = ['dark', 'light']
/* Palettes: messapp Blue (the default, Blue + OLED) plus Orion Store's set.
   The CSS for each lives in index.css. The storage key and data attribute keep
   the older "surface tint" name. Unknown values, including the retired
   'neutral'/'steel'/'indigo'/'moss'/'clay', fall back to Blue. */
export const PALETTES = [
  { id: 'blue', label: 'Blue' },
  { id: 'orion', label: 'Orion' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'rose', label: 'Rose' },
  { id: 'mono', label: 'Mono' },
  { id: 'grape', label: 'Grape' },
  { id: 'mint', label: 'Mint' },
  { id: 'ember', label: 'Ember' },
  { id: 'amber', label: 'Amber' },
  { id: 'cyber', label: 'Cyber' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'lime', label: 'Lime' },
  { id: 'cocoa', label: 'Cocoa' }
]
export const SURFACE_TINTS = PALETTES.map(palette => palette.id)

export function normalizeThemeMode(value) {
  return value === 'light' ? 'light' : 'dark'
}

export function normalizeSurfaceTint(value) {
  return SURFACE_TINTS.includes(value) ? value : 'blue'
}

export function applyThemeMode(value, { persist = true } = {}) {
  const theme = normalizeThemeMode(value)
  const surface = theme === 'dark' ? '#000000' : '#fbfcfe'

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface)
  }

  /* The native shells draw under a transparent status bar (targetSdk 35 forces
     edge to edge), so the clock and system icons take their colour from here,
     not from the page behind them. Left alone they stay light, which is
     invisible against the light theme's near-white surface. `Style.Light`
     means "dark glyphs for a light background", not light glyphs.
     setBackgroundColor is for pre-Android-15 devices, where the bar is still
     an opaque strip; it no-ops (and warns) once the system enforces edge to
     edge, so its rejection is ignored like the rest. */
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
    if (Capacitor.getPlatform() === 'android') StatusBar.setBackgroundColor({ color: surface }).catch(() => {})
  }

  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem('appTheme', theme)
  }

  return theme
}

export function applySurfaceTint(value, { persist = true } = {}) {
  const tint = normalizeSurfaceTint(value)

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-surface-tint', tint)
  }

  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem('surfaceTint', tint)
  }

  return tint
}

/* UI styles change shape, material and type, independent of the palette.
   The CSS for each lives in src/style/styles/. Unknown values fall back to
   'default', which is the look with no style rules applied. */
export const UI_STYLES = [
  { id: 'default', label: 'Default' },
  { id: 'glass', label: 'Liquid Glass' },
  { id: 'nothing', label: 'Nothing' },
  { id: 'material', label: 'Material You' }
]

export function normalizeUiStyle(value) {
  return UI_STYLES.some(style => style.id === value) ? value : 'default'
}

export function applyUiStyle(value, { persist = true } = {}) {
  const style = normalizeUiStyle(value)

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-ui-style', style)
  }

  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem('uiStyle', style)
  }

  return style
}

/* Liquid Glass refraction is on unless turned off; the manager in
   liquidGlass.js reads the attribute and only acts on Chromium. */
export function normalizeGlassRefraction(value) {
  return value === 'off' ? 'off' : 'on'
}

export function applyGlassRefraction(value, { persist = true } = {}) {
  const refraction = normalizeGlassRefraction(value)

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-glass-refraction', refraction)
  }

  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem('glassRefraction', refraction)
  }

  return refraction
}

/* The image behind Liquid Glass. Stored per device as a downscaled JPEG data
   URL; storage can be full or blocked, so every access may fail and the
   palette art is the fallback. */
export const GLASS_WALLPAPER_KEY = 'glassWallpaper'
export const GLASS_WALLPAPER_EVENT = 'messapp:glass-wallpaper'

export function readGlassWallpaper() {
  try {
    return localStorage.getItem(GLASS_WALLPAPER_KEY) || ''
  } catch {
    return ''
  }
}

/** Saves (or with an empty value clears) the wallpaper; false when storage refused it. */
export function saveGlassWallpaper(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(GLASS_WALLPAPER_KEY, dataUrl)
    else localStorage.removeItem(GLASS_WALLPAPER_KEY)
  } catch {
    return false
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GLASS_WALLPAPER_EVENT))
  return true
}
