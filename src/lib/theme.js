/** Normalizes and applies the persisted document theme mode. */
export const THEME_MODES = ['dark', 'light']

export function normalizeThemeMode(value) {
  return value === 'light' ? 'light' : 'dark'
}

export function applyThemeMode(value, { persist = true } = {}) {
  const theme = normalizeThemeMode(value)

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }

  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem('appTheme', theme)
  }

  return theme
}
