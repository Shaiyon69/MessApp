// Theme management service for multiple color schemes
class ThemeManager {
  constructor() {
    this.currentTheme = 'dark'
    this.themes = {
      dark: {
        name: 'Dark',
        icon: '🌙',
        colors: {
          '--bg-base': '#121417',
          '--bg-surface': '#1a1c24',
          '--bg-element': '#25262b',
          '--text-main': '#ffffff',
          '--text-secondary': '#b4b4b4',
          '--text-muted': '#6b7280',
          '--border-subtle': '#374151',
          '--border-medium': '#4b5563',
          '--theme-base': '#6366f1',
          '--theme-hover': '#7c3aed',
          '--theme-50': '#eef2ff',
          '--theme-100': '#e0e7ff',
          '--theme-500': '#6366f1',
          '--theme-600': '#4f46e5',
          '--theme-700': '#4338ca',
          '--success': '#10b981',
          '--warning': '#f59e0b',
          '--error': '#ef4444',
          '--info': '#3b82f6'
        }
      },
      light: {
        name: 'Light',
        icon: '☀️',
        colors: {
          '--bg-base': '#ffffff',
          '--bg-surface': '#f8fafc',
          '--bg-element': '#f1f5f9',
          '--text-main': '#1e293b',
          '--text-secondary': '#475569',
          '--text-muted': '#94a3b8',
          '--border-subtle': '#e2e8f0',
          '--border-medium': '#cbd5e1',
          '--theme-base': '#6366f1',
          '--theme-hover': '#7c3aed',
          '--theme-50': '#eef2ff',
          '--theme-100': '#e0e7ff',
          '--theme-500': '#6366f1',
          '--theme-600': '#4f46e5',
          '--theme-700': '#4338ca',
          '--success': '#10b981',
          '--warning': '#f59e0b',
          '--error': '#ef4444',
          '--info': '#3b82f6'
        }
      },
      ocean: {
        name: 'Ocean',
        icon: '🌊',
        colors: {
          '--bg-base': '#0f172a',
          '--bg-surface': '#1e293b',
          '--bg-element': '#334155',
          '--text-main': '#f8fafc',
          '--text-secondary': '#cbd5e1',
          '--text-muted': '#94a3b8',
          '--border-subtle': '#475569',
          '--border-medium': '#64748b',
          '--theme-base': '#06b6d4',
          '--theme-hover': '#0891b2',
          '--theme-50': '#f0fdfa',
          '--theme-100': '#ccfbf1',
          '--theme-500': '#06b6d4',
          '--theme-600': '#0891b2',
          '--theme-700': '#0e7490',
          '--success': '#10b981',
          '--warning': '#f59e0b',
          '--error': '#ef4444',
          '--info': '#3b82f6'
        }
      },
      sunset: {
        name: 'Sunset',
        icon: '🌅',
        colors: {
          '--bg-base': '#431407',
          '--bg-surface': '#7c2d12',
          '--bg-element': '#9a3412',
          '--text-main': '#fef3c7',
          '--text-secondary': '#fed7aa',
          '--text-muted': '#fb923c',
          '--border-subtle': '#c2410c',
          '--border-medium': '#ea580c',
          '--theme-base': '#f97316',
          '--theme-hover': '#ea580c',
          '--theme-50': '#fff7ed',
          '--theme-100': '#ffedd5',
          '--theme-500': '#f97316',
          '--theme-600': '#ea580c',
          '--theme-700': '#c2410c',
          '--success': '#10b981',
          '--warning': '#fbbf24',
          '--error': '#dc2626',
          '--info': '#3b82f6'
        }
      },
      forest: {
        name: 'Forest',
        icon: '🌲',
        colors: {
          '--bg-base': '#14532d',
          '--bg-surface': '#166534',
          '--bg-element': '#15803d',
          '--text-main': '#dcfce7',
          '--text-secondary': '#bbf7d0',
          '--text-muted': '#86efac',
          '--border-subtle': '#166534',
          '--border-medium': '#16a34a',
          '--theme-base': '#22c55e',
          '--theme-hover': '#16a34a',
          '--theme-50': '#f0fdf4',
          '--theme-100': '#dcfce7',
          '--theme-500': '#22c55e',
          '--theme-600': '#16a34a',
          '--theme-700': '#15803d',
          '--success': '#10b981',
          '--warning': '#f59e0b',
          '--error': '#ef4444',
          '--info': '#3b82f6'
        }
      },
      purple: {
        name: 'Purple',
        icon: '💜',
        colors: {
          '--bg-base': '#2e1065',
          '--bg-surface': '#4c1d95',
          '--bg-element': '#5b21b6',
          '--text-main': '#f3e8ff',
          '--text-secondary': '#e9d5ff',
          '--text-muted': '#d8b4fe',
          '--border-subtle': '#4c1d95',
          '--border-medium': '#6d28d9',
          '--theme-base': '#a855f7',
          '--theme-hover': '#9333ea',
          '--theme-50': '#faf5ff',
          '--theme-100': '#f3e8ff',
          '--theme-500': '#a855f7',
          '--theme-600': '#9333ea',
          '--theme-700': '#7c3aed',
          '--success': '#10b981',
          '--warning': '#f59e0b',
          '--error': '#ef4444',
          '--info': '#3b82f6'
        }
      },
      cyberpunk: {
        name: 'Cyberpunk',
        icon: '🤖',
        colors: {
          '--bg-base': '#0a0a0a',
          '--bg-surface': '#1a1a1a',
          '--bg-element': '#2a2a2a',
          '--text-main': '#00ff41',
          '--text-secondary': '#00cc33',
          '--text-muted': '#008822',
          '--border-subtle': '#333333',
          '--border-medium': '#444444',
          '--theme-base': '#ff0080',
          '--theme-hover': '#ff0040',
          '--theme-50': '#001100',
          '--theme-100': '#002200',
          '--theme-500': '#ff0080',
          '--theme-600': '#ff0040',
          '--theme-700': '#cc0066',
          '--success': '#00ff41',
          '--warning': '#ffaa00',
          '--error': '#ff0040',
          '--info': '#00aaff'
        }
      }
    }
    
    this.init()
  }

  // Initialize theme manager
  init() {
    // Load saved theme
    const savedTheme = localStorage.getItem('messapp_theme')
    if (savedTheme && this.themes[savedTheme]) {
      this.currentTheme = savedTheme
    } else {
      // Detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      this.currentTheme = prefersDark ? 'dark' : 'light'
    }
    
    this.applyTheme(this.currentTheme)
    this.setupSystemThemeListener()
  }

  // Setup system theme change listener
  setupSystemThemeListener() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only auto-switch if user hasn't manually set a theme
      if (!localStorage.getItem('messapp_theme')) {
        this.currentTheme = e.matches ? 'dark' : 'light'
        this.applyTheme(this.currentTheme)
      }
    })
  }

  // Apply theme to document
  applyTheme(themeName) {
    const theme = this.themes[themeName]
    if (!theme) return

    const root = document.documentElement
    
    // Apply all CSS custom properties
    Object.entries(theme.colors).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })
    
    // Update theme class for additional styling
    root.className = `theme-${themeName}`
    
    // Update meta theme color for mobile browsers
    this.updateMetaThemeColor(theme.colors['--bg-base'])
  }

  // Update meta theme color
  updateMetaThemeColor(color) {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta')
      metaThemeColor.name = 'theme-color'
      document.head.appendChild(metaThemeColor)
    }
    metaThemeColor.content = color
  }

  // Switch to a different theme
  switchTheme(themeName) {
    if (!this.themes[themeName]) {
      console.warn(`Theme "${themeName}" not found`)
      return false
    }
    
    this.currentTheme = themeName
    this.applyTheme(themeName)
    localStorage.setItem('messapp_theme', themeName)
    
    // Dispatch theme change event
    window.dispatchEvent(new CustomEvent('themechange', { 
      detail: { theme: themeName, themeData: this.themes[themeName] }
    }))
    
    return true
  }

  // Get current theme
  getCurrentTheme() {
    return this.currentTheme
  }

  // Get current theme data
  getCurrentThemeData() {
    return this.themes[this.currentTheme]
  }

  // Get all available themes
  getAvailableThemes() {
    return Object.entries(this.themes).map(([key, theme]) => ({
      id: key,
      name: theme.name,
      icon: theme.icon,
      colors: theme.colors
    }))
  }

  // Get theme color value
  getColor(colorName) {
    const theme = this.themes[this.currentTheme]
    return theme?.colors[colorName] || null
  }

  // Check if theme is dark
  isDarkTheme() {
    const theme = this.themes[this.currentTheme]
    const bgColor = theme?.colors['--bg-base']
    
    // Simple check: if background is dark (luminance < 0.5)
    return this.isColorDark(bgColor)
  }

  // Check if color is dark (simple luminance calculation)
  isColorDark(color) {
    // Convert hex to RGB
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5
  }

  // Reset to system theme
  resetToSystemTheme() {
    localStorage.removeItem('messapp_theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    this.currentTheme = prefersDark ? 'dark' : 'light'
    this.applyTheme(this.currentTheme)
  }

  // Create custom theme
  createCustomTheme(name, colors) {
    const customTheme = {
      name,
      icon: '🎨',
      colors: { ...this.themes.dark.colors, ...colors }
    }
    
    this.themes[`custom_${name}`] = customTheme
    return customTheme
  }

  // Export theme configuration
  exportTheme(themeName) {
    const theme = this.themes[themeName]
    if (!theme) return null
    
    return {
      name: theme.name,
      colors: { ...theme.colors }
    }
  }

  // Import theme configuration
  importTheme(themeConfig) {
    const { name, colors } = themeConfig
    const id = `imported_${name.toLowerCase().replace(/\s+/g, '_')}`
    
    this.themes[id] = {
      name,
      icon: '📥',
      colors: { ...this.themes.dark.colors, ...colors }
    }
    
    return id
  }
}

// Export singleton instance
export const themeManager = new ThemeManager()

// Export convenience functions
export const switchTheme = (themeName) => themeManager.switchTheme(themeName)
export const getCurrentTheme = () => themeManager.getCurrentTheme()
export const getAvailableThemes = () => themeManager.getAvailableThemes()
export const isDarkTheme = () => themeManager.isDarkTheme()
export const getThemeColor = (colorName) => themeManager.getColor(colorName)
export const resetToSystemTheme = () => themeManager.resetToSystemTheme()
