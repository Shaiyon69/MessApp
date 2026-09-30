/**
 * Full-screen iMessage-style effect, played when a fresh message carrying
 * `{!confetti}` / `{!balloons}` / `{!fireworks}` mounts. MessageElements fires
 * the event; this only draws. Particles are plain spans on CSS keyframes.
 */
import { useEffect, useState } from 'react'
import { SCREEN_EFFECT_EVENT } from '../../lib/messageEffects'

const GLYPHS = {
  confetti: ['🎉', '🎊', '✨', '🟨', '🟦', '🟥', '🟩'],
  balloons: ['🎈', '🎈', '🎈', '🎈', '🎈'],
  fireworks: ['🎆', '🎇', '✨', '💥']
}
const PARTICLES = 40
const DURATION_MS = 3500

const makeParticles = (effect) => Array.from({ length: PARTICLES }, (_, i) => ({
  glyph: GLYPHS[effect][i % GLYPHS[effect].length],
  style: {
    '--x': `${Math.random() * 100}vw`,
    '--drift': `${(Math.random() - 0.5) * 30}vw`,
    '--delay': `${Math.random() * 0.8}s`,
    '--spin': `${(Math.random() - 0.5) * 720}deg`,
    '--scale': 0.7 + Math.random() * 0.8
  }
}))

export default function ScreenEffect() {
  const [play, setPlay] = useState(null)

  useEffect(() => {
    const onEffect = (event) => {
      if (!GLYPHS[event.detail]) return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      setPlay({ effect: event.detail, key: Date.now(), particles: makeParticles(event.detail) })
    }
    window.addEventListener(SCREEN_EFFECT_EVENT, onEffect)
    return () => window.removeEventListener(SCREEN_EFFECT_EVENT, onEffect)
  }, [])

  useEffect(() => {
    if (!play) return
    const timer = setTimeout(() => setPlay(null), DURATION_MS)
    return () => clearTimeout(timer)
  }, [play])

  if (!play) return null
  return (
    <div key={play.key} className={`screen-fx screen-fx-${play.effect}`} aria-hidden="true">
      {play.particles.map((particle, i) => (
        <span key={i} style={particle.style}>{particle.glyph}</span>
      ))}
    </div>
  )
}
