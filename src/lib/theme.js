/** Normalizes and applies the persisted document theme mode. */
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export const THEME_MODES = ['dark', 'light']
/* Renaming a tint is intentionally a silent downgrade: normalizeSurfaceTint
   falls back to 'neutral', so the retired 'indigo'/'moss'/'clay' values
   persisted in localStorage resolve to the base palette rather than breaking. */
export const SURFACE_TINTS = ['neutral', 'ocean', 'steel']

export function normalizeThemeMode(value) {
  return value === 'light' ? 'light' : 'dark'
}

export function normalizeSurfaceTint(value) {
  return SURFACE_TINTS.includes(value) ? value : 'neutral'
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
