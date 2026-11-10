/**
 * Text colour for a friend's "Playing X" label, taken from the game's cover.
 * Only the hue and saturation come from the image; the lightness is a theme
 * token (--game-accent-l) so the label stays readable in light and dark.
 */

export const FALLBACK_ACCENT = '#23a559'

/** RGBA bytes to "hsl(...)", or null when the image has no vivid colour. */
export const accentFromPixels = (data) => {
  let r = 0, g = 0, b = 0, weight = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    if (!max) continue
    // Vivid, bright pixels pick the hue; greys and shadows barely count.
    const sat = (max - min) / max
    const w = sat * sat * (max / 255)
    r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w; weight += w
  }
  if (weight < 0.5) return null
  return toAccent(r / (weight * 255), g / (weight * 255), b / (weight * 255))
}

/** "#rrggbb" sent by Chimaera (it reads covers friends cannot) to the label colour, or null. */
export const accentFromHex = (value) => {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return null
  const n = parseInt(value.slice(1), 16)
  return toAccent((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// r, g, b in 0..1 to the hue and saturation at the theme's lightness.
const toAccent = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.08) return null
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  const s = Math.min(85, Math.max(50, Math.round((d / (1 - Math.abs(max + min - 1))) * 100)))
  return `hsl(${Math.round(h * 60)} ${s}% var(--game-accent-l, 62%))`
}
