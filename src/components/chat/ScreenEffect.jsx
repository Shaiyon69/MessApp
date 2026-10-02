/**
 * Full-screen iMessage-style effect, played when a fresh message carries
 * `{!confetti}` and friends, or says a trigger phrase ("happy birthday",
 * "pew pew"). MessageElements fires the event; this only draws. Particles
 * are plain spans on CSS keyframes, tuned per effect through CSS variables.
 */
import { useEffect, useState } from 'react'
import { SCREEN_EFFECT_EVENT } from '../../lib/messageEffects'

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#007aff', '#af52de', '#ff2d55']
const DURATION_MS = 4000

const rand = (min, max) => min + Math.random() * (max - min)
const pick = list => list[Math.floor(Math.random() * list.length)]
const times = (count, make) => Array.from({ length: count }, (_, i) => make(i))

const MAKERS = {
  confetti: () => times(90, () => ({
    style: {
      '--x': `${rand(0, 100)}vw`,
      '--drift': `${rand(-15, 15)}vw`,
      '--delay': `${rand(0, 1)}s`,
      '--dur': `${rand(2.2, 3.2)}s`,
      '--spin': `${rand(-720, 720)}deg`,
      '--w': `${rand(6, 10)}px`,
      '--c': pick(COLORS)
    }
  })),
  balloons: () => times(16, () => ({
    style: {
      '--x': `${rand(-5, 95)}vw`,
      '--sway': `${rand(-6, 6)}vw`,
      '--delay': `${rand(0, 1.2)}s`,
      '--dur': `${rand(2.6, 3.4)}s`,
      '--size': `${rand(56, 84)}px`,
      '--c': pick(COLORS)
    }
  })),
  fireworks: () => times(6, i => ({
    style: {
      '--x': `${rand(15, 85)}vw`,
      '--y': `${rand(15, 55)}vh`,
      '--delay': `${i * 0.45 + rand(0, 0.2)}s`,
      '--c': pick(COLORS)
    },
    sparks: 28
  })),
  lasers: () => times(10, i => ({
    style: {
      '--a': `${i * 36 + rand(-10, 10)}deg`,
      '--delay': `${rand(0, 0.4)}s`,
      '--c': pick(COLORS)
    }
  })),
  love: () => [
    { className: 'screen-fx-heart', glyph: '❤️' },
    ...times(16, () => ({
      glyph: pick(['❤️', '💖', '💕']),
      style: {
        '--x': `${rand(5, 95)}vw`,
        '--drift': `${rand(-10, 10)}vw`,
        '--delay': `${rand(0.3, 1.8)}s`,
        '--dur': `${rand(1.8, 2.6)}s`,
        '--scale': rand(0.7, 1.4)
      }
    }))
  ],
  celebration: () => times(70, () => ({
    style: {
      '--a': `${rand(95, 175)}deg`,
      '--d': `${rand(30, 110)}vmax`,
      '--delay': `${rand(0, 1.6)}s`,
      '--size': `${rand(3, 7)}px`
    }
  }))
}

export default function ScreenEffect() {
  const [play, setPlay] = useState(null)

  useEffect(() => {
    const onEffect = (event) => {
      if (!MAKERS[event.detail]) return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      setPlay({ effect: event.detail, key: Date.now(), particles: MAKERS[event.detail]() })
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
        <span key={i} className={particle.className} style={particle.style}>
          {particle.glyph}
          {particle.sparks && times(particle.sparks, j => <i key={j} style={{ '--a': `${(j * 360) / particle.sparks}deg` }} />)}
        </span>
      ))}
    </div>
  )
}
