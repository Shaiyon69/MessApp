/** Normalizes and applies the persisted document theme mode. */
export const THEME_MODES = ['dark', 'light']
export const SURFACE_TINTS = ['neutral', 'indigo', 'ocean']

export function normalizeThemeMode(value) {
  return value === 'light' ? 'light' : 'dark'
}

export function normalizeSurfaceTint(value) {
  return SURFACE_TINTS.includes(value) ? value : 'neutral'
}

export function applyThemeMode(value, { persist = true } = {}) {
  const theme = normalizeThemeMode(value)

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#f7f8fb')
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
