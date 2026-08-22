/** Normalizes and applies the persisted document theme mode. */
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

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#fbfcfe')
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
