const THEME_DEFINITIONS = {
  mono: {
    id: 'mono',
    name: 'Mono',
    description: 'Pure black and white',
    dark: {
      accent: '#f5f5f5',
      outgoingBackground: '#000000',
      outgoingBorder: '#303030',
      outgoingText: '#fafafa',
      base: '#000000',
      surface: '#0a0a0a',
      element: '#171717',
      border: '#2a2a2a',
      text: '#fafafa',
      muted: '#a3a3a3'
    },
    light: {
      accent: '#171717',
      outgoingText: '#ffffff',
      base: '#ffffff',
      surface: '#f7f7f7',
      element: '#eeeeee',
      border: '#d4d4d4',
      text: '#111111',
      muted: '#626262'
    }
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Clear blue with calm surfaces',
    dark: {
      accent: '#38bdf8',
      outgoingText: '#082f49',
      base: '#000000',
      surface: '#071014',
      element: '#102027',
      border: '#233943',
      text: '#f0f9ff',
      muted: '#94aeb9'
    },
    light: {
      accent: '#0369a1',
      outgoingText: '#ffffff',
      base: '#f7fcff',
      surface: '#edf8fd',
      element: '#dceff7',
      border: '#bad9e7',
      text: '#102a3a',
      muted: '#55707d'
    }
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green and soft contrast',
    dark: {
      accent: '#34d399',
      outgoingText: '#022c22',
      base: '#000000',
      surface: '#07100d',
      element: '#102019',
      border: '#243b31',
      text: '#f0fdf4',
      muted: '#9ab3a5'
    },
    light: {
      accent: '#047857',
      outgoingText: '#ffffff',
      base: '#f8fcf9',
      surface: '#eef8f1',
      element: '#dff0e5',
      border: '#bfd9c8',
      text: '#122b1d',
      muted: '#577263'
    }
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm coral without glare',
    dark: {
      accent: '#fb7185',
      outgoingText: '#4c0519',
      base: '#000000',
      surface: '#12090a',
      element: '#251315',
      border: '#43282c',
      text: '#fff1f2',
      muted: '#bea0a4'
    },
    light: {
      accent: '#be123c',
      outgoingText: '#ffffff',
      base: '#fffafa',
      surface: '#fff1f2',
      element: '#ffe4e6',
      border: '#fecdd3',
      text: '#3b1119',
      muted: '#805c63'
    }
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft violet with crisp text',
    dark: {
      accent: '#a78bfa',
      outgoingText: '#2e1065',
      base: '#000000',
      surface: '#0d0914',
      element: '#1d162b',
      border: '#392e4d',
      text: '#faf5ff',
      muted: '#afa3bd'
    },
    light: {
      accent: '#6d28d9',
      outgoingText: '#ffffff',
      base: '#fcfaff',
      surface: '#f6f0ff',
      element: '#eee5ff',
      border: '#d9c8f2',
      text: '#28163d',
      muted: '#6d607b'
    }
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    description: 'Warm gold and paper-like light mode',
    dark: {
      accent: '#fbbf24',
      outgoingText: '#422006',
      base: '#000000',
      surface: '#120e05',
      element: '#251d0d',
      border: '#463719',
      text: '#fffbeb',
      muted: '#b9aa85'
    },
    light: {
      accent: '#a16207',
      outgoingText: '#ffffff',
      base: '#fffdf7',
      surface: '#fff8e7',
      element: '#f8edcf',
      border: '#e6d39d',
      text: '#352609',
      muted: '#746746'
    }
  }
}

const LEGACY_COLOR_THEME_IDS = {
  '#f5f5f5': 'mono',
  '#171717': 'mono',
  '#38bdf8': 'ocean',
  '#0369a1': 'ocean',
  '#34d399': 'forest',
  '#047857': 'forest',
  '#fb7185': 'sunset',
  '#be123c': 'sunset',
  '#a78bfa': 'lavender',
  '#6d28d9': 'lavender',
  '#fbbf24': 'amber',
  '#a16207': 'amber',
  '#6366f1': 'lavender',
  '#a855f7': 'lavender',
  '#ec4899': 'sunset',
  '#f43f5e': 'sunset',
  '#10b981': 'forest',
  '#f59e0b': 'amber'
}

export const CONVERSATION_THEMES = Object.values(THEME_DEFINITIONS)
export const DEFAULT_CONVERSATION_THEME = 'mono'

export function normalizeConversationThemeId(value) {
  return Object.hasOwn(THEME_DEFINITIONS, value) ? value : DEFAULT_CONVERSATION_THEME
}

export function resolveConversationThemeId(themeId, legacyColor) {
  if (Object.hasOwn(THEME_DEFINITIONS, themeId)) return themeId
  return LEGACY_COLOR_THEME_IDS[String(legacyColor || '').toLowerCase()] || DEFAULT_CONVERSATION_THEME
}

export function isConversationThemeSchemaError(error) {
  if (!error) return false
  const context = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
  return context.includes('theme_id') && (
    context.includes('does not exist') ||
    context.includes('schema cache') ||
    context.includes('pgrst204') ||
    context.includes('42703')
  )
}

export function getConversationTheme(themeId, mode = 'dark') {
  const theme = THEME_DEFINITIONS[normalizeConversationThemeId(themeId)]
  const palette = theme[mode === 'light' ? 'light' : 'dark']
  return { ...theme, palette }
}

export function getConversationThemeStyle(themeId, mode = 'dark') {
  const { palette } = getConversationTheme(themeId, mode)
  return {
    '--theme-base': palette.accent,
    '--theme-10': `${palette.accent}1a`,
    '--theme-20': `${palette.accent}33`,
    '--theme-50': `${palette.accent}80`,
    '--chat-bg-base': palette.base,
    '--chat-bg-surface': palette.surface,
    '--chat-bg-element': palette.element,
    '--chat-border': palette.border,
    '--chat-text': palette.text,
    '--chat-text-muted': palette.muted,
    '--chat-outgoing-bg': palette.outgoingBackground || palette.accent,
    '--chat-outgoing-border': palette.outgoingBorder || palette.accent,
    '--chat-outgoing-text': palette.outgoingText
  }
}
