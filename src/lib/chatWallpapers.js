export const DEFAULT_CHAT_WALLPAPER = 'default'
export const CUSTOM_WALLPAPER_PREFIX = 'custom:'

export const CHAT_WALLPAPERS = [
  { id: 'none', name: 'Pure', description: 'Calm and distraction-free', css: 'none' },
  {
    id: 'default',
    name: 'Dreamscape',
    description: 'Soft luminous color mesh',
    css: 'radial-gradient(ellipse at 8% 4%, var(--theme-20) 0%, transparent 38%), radial-gradient(ellipse at 96% 8%, rgba(45, 212, 191, 0.16) 0%, transparent 34%), radial-gradient(ellipse at 76% 100%, rgba(244, 114, 182, 0.14) 0%, transparent 42%), radial-gradient(ellipse at 18% 92%, rgba(251, 191, 36, 0.10) 0%, transparent 34%), linear-gradient(145deg, rgba(255, 255, 255, 0.035), transparent 55%)',
    size: '100% 100%',
    repeat: 'no-repeat'
  },
  {
    id: 'doodles',
    name: 'Linen',
    description: 'Warm woven paper texture',
    css: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(148,163,184,0.035) 0 1px, transparent 1px 5px), radial-gradient(ellipse at 8% 12%, rgba(251,191,36,0.11), transparent 38%), radial-gradient(ellipse at 94% 88%, var(--theme-10), transparent 42%)',
    size: 'auto, auto, 100% 100%, 100% 100%',
    repeat: 'repeat, repeat, no-repeat, no-repeat'
  },
  {
    id: 'galaxy',
    name: 'Northern Lights',
    description: 'Flowing jewel-tone aurora',
    css: 'radial-gradient(ellipse at 18% -8%, rgba(56,189,248,0.24) 0%, transparent 44%), radial-gradient(ellipse at 82% 4%, rgba(168,85,247,0.20) 0%, transparent 42%), radial-gradient(ellipse at 54% 108%, rgba(16,185,129,0.18) 0%, transparent 46%), linear-gradient(118deg, transparent 28%, var(--theme-10) 48%, transparent 68%), linear-gradient(160deg, rgba(255,255,255,0.035), transparent 54%)',
    size: '100% 100%',
    repeat: 'no-repeat'
  },
  {
    id: 'emerald',
    name: 'Blueprint',
    description: 'Crisp architectural lines',
    css: 'linear-gradient(rgba(56,189,248,0.075) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.075) 1px, transparent 1px), linear-gradient(rgba(148,163,184,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.035) 1px, transparent 1px), radial-gradient(ellipse at 85% 10%, var(--theme-20), transparent 42%)',
    size: '64px 64px, 64px 64px, 16px 16px, 16px 16px, 100% 100%',
    repeat: 'repeat, repeat, repeat, repeat, no-repeat'
  },
  {
    id: 'topography',
    name: 'Contours',
    description: 'Wide, graceful flowing lines',
    css: 'radial-gradient(ellipse at -12% 22%, transparent 0 46%, var(--theme-20) 47% 48%, transparent 49% 58%, rgba(148,163,184,0.07) 59% 60%, transparent 61%), radial-gradient(ellipse at 112% 82%, transparent 0 43%, rgba(45,212,191,0.10) 44% 45%, transparent 46% 55%, var(--theme-10) 56% 57%, transparent 58%), linear-gradient(145deg, rgba(255,255,255,0.025), transparent 52%)',
    size: '100% 100%',
    position: 'center',
    repeat: 'no-repeat'
  },
  {
    id: 'midnight',
    name: 'Constellation',
    description: 'A quiet field of stars',
    css: 'radial-gradient(circle, rgba(255,255,255,0.26) 0 1px, transparent 1.6px), radial-gradient(circle, var(--theme-50) 0 1.2px, transparent 1.8px), linear-gradient(32deg, transparent 49.5%, rgba(148,163,184,0.055) 50%, transparent 50.5%), radial-gradient(ellipse at 72% 18%, var(--theme-10), transparent 38%)',
    size: '53px 53px, 79px 79px, 110px 110px, 100% 100%',
    position: '3px 7px, 31px 17px, 8px 24px, center',
    repeat: 'repeat, repeat, repeat, no-repeat'
  },
  {
    id: 'confetti',
    name: 'Celebration',
    description: 'Soft lights with a little sparkle',
    css: 'radial-gradient(circle at 12% 18%, rgba(244,114,182,0.18) 0 2%, transparent 10%), radial-gradient(circle at 82% 14%, rgba(45,212,191,0.16) 0 2%, transparent 11%), radial-gradient(circle at 72% 78%, rgba(251,191,36,0.15) 0 1.5%, transparent 9%), radial-gradient(circle at 24% 86%, var(--theme-20) 0 2%, transparent 12%), radial-gradient(circle at 48% 42%, rgba(255,255,255,0.11) 0 0.8%, transparent 6%), linear-gradient(135deg, transparent, rgba(255,255,255,0.025), transparent)',
    size: '100% 100%',
    position: 'center',
    repeat: 'no-repeat'
  },
  {
    id: 'waves',
    name: 'Ocean Glass',
    description: 'Calm translucent blue layers',
    css: 'radial-gradient(ellipse at 44% 118%, rgba(56,189,248,0.18) 0%, transparent 58%), radial-gradient(ellipse at 96% 72%, rgba(45,212,191,0.12) 0%, transparent 46%), radial-gradient(ellipse at 2% 8%, var(--theme-10) 0%, transparent 42%), linear-gradient(118deg, transparent 30%, rgba(255,255,255,0.045) 47%, transparent 64%), linear-gradient(180deg, rgba(56,189,248,0.035), transparent 65%)',
    size: '100% 100%',
    position: 'center',
    repeat: 'no-repeat'
  },
  {
    id: 'sunrise',
    name: 'Golden Hour',
    description: 'A warm cinematic glow',
    css: 'radial-gradient(circle at 8% 92%, rgba(251,191,36,0.25) 0%, transparent 34%), radial-gradient(ellipse at 92% 4%, rgba(251,113,133,0.20) 0%, transparent 40%), radial-gradient(ellipse at 55% 115%, rgba(249,115,22,0.12) 0%, transparent 48%), linear-gradient(135deg, rgba(255,255,255,0.04), transparent 52%)',
    size: '100% 100%',
    repeat: 'no-repeat'
  },
  {
    id: 'checker',
    name: 'Terrazzo',
    description: 'A few polished glass fragments',
    css: 'conic-gradient(from 28deg at 14% 18%, transparent 0 12%, rgba(244,114,182,0.12) 13% 19%, transparent 20% 100%), conic-gradient(from 205deg at 86% 24%, transparent 0 9%, rgba(45,212,191,0.11) 10% 16%, transparent 17% 100%), conic-gradient(from 116deg at 72% 84%, transparent 0 10%, var(--theme-10) 11% 18%, transparent 19% 100%), radial-gradient(ellipse at 18% 88%, rgba(251,191,36,0.09), transparent 28%), linear-gradient(145deg, rgba(255,255,255,0.025), transparent 58%)',
    size: '100% 100%',
    position: 'center',
    repeat: 'no-repeat'
  },
  {
    id: 'petals',
    name: 'Sakura',
    description: 'A sparse blush of petals',
    css: 'radial-gradient(ellipse 13% 7% at 16% 22%, rgba(244,114,182,0.18) 0 42%, transparent 54%), radial-gradient(ellipse 11% 6% at 28% 34%, rgba(251,207,232,0.14) 0 42%, transparent 55%), radial-gradient(ellipse 14% 8% at 82% 72%, rgba(244,114,182,0.13) 0 42%, transparent 54%), radial-gradient(ellipse 9% 5% at 68% 84%, var(--theme-10) 0 42%, transparent 56%), linear-gradient(128deg, transparent 0 33%, rgba(148,163,184,0.045) 34% 34.5%, transparent 35% 100%), radial-gradient(ellipse at 12% 10%, rgba(244,114,182,0.07), transparent 38%)',
    size: '100% 100%',
    position: 'center',
    repeat: 'no-repeat'
  }
]

const CUSTOM_WALLPAPER_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/wallpaper-[0-9a-f-]{36}\.(?:jpe?g|png|webp)$/i
const ALLOWED_CUSTOM_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function isCustomWallpaperValue(value) {
  if (typeof value !== 'string' || !value.startsWith(CUSTOM_WALLPAPER_PREFIX)) return false
  return CUSTOM_WALLPAPER_PATH.test(value.slice(CUSTOM_WALLPAPER_PREFIX.length))
}

export function getCustomWallpaperPath(value) {
  return isCustomWallpaperValue(value) ? value.slice(CUSTOM_WALLPAPER_PREFIX.length) : null
}

export function normalizeChatWallpaper(value) {
  if (isCustomWallpaperValue(value)) return value
  return CHAT_WALLPAPERS.some(wallpaper => wallpaper.id === value) ? value : DEFAULT_CHAT_WALLPAPER
}

export function getChatWallpaper(value) {
  const normalized = normalizeChatWallpaper(value)
  if (isCustomWallpaperValue(normalized)) {
    return { id: normalized, name: 'Custom', description: 'Your uploaded image', css: 'none', size: 'cover', repeat: 'no-repeat', position: 'center' }
  }
  return CHAT_WALLPAPERS.find(wallpaper => wallpaper.id === normalized)
}

export function validateCustomWallpaperFile(file) {
  if (!file || !ALLOWED_CUSTOM_TYPES.has(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Custom wallpapers must be 10 MB or smaller.')
  return true
}

export function getWallpaperFileExtension(type) {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}
