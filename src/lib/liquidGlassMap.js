/* Displacement map for the Liquid Glass style, ported from Serpantinum's
   liquid_glass.frag (github.com/ilyamiro/serpantinum). The shader bends the
   backdrop only inside a bezel along the edge: a rounded-rect SDF gives the
   surface normal there, refract() at IOR 1.5 turns it into an offset, and
   the interior stays flat. Small elements also get a slight centre lens.
   The result feeds an SVG feDisplacementMap, which reads R as x and G as y,
   with 128 meaning "no offset". Pure so it runs under node --test. */

const IOR = 1.5
const LENS_ZOOM = 0.045
const LENS_FULL = 180
const LENS_NONE = 420

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/* Same bezel the QML component derives from the item size. */
export function glassBezel(width, height) {
  return clamp(Math.min(width, height) * 0.36, 5, 26)
}

function sdRoundBox(px, py, hx, hy, radius) {
  const r = Math.min(radius, hx, hy)
  const qx = Math.abs(px) - hx + r
  const qy = Math.abs(py) - hy + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

/* refract(I = (0,0,-1), N, eta) from GLSL, returning the xy offset scaled by
   the glass thickness, as displacement() does in the shader. */
function refractOffset(nx, ny, nz, travel) {
  const eta = 1 / IOR
  const cosI = -nz
  const k = 1 - eta * eta * (1 - cosI * cosI)
  if (k < 0) return [0, 0]
  const scale = eta * cosI + Math.sqrt(k)
  const rx = -scale * nx
  const ry = -scale * ny
  const rz = -eta - scale * nz
  const depth = Math.max(-rz, 0.2)
  return [(rx / depth) * travel, (ry / depth) * travel]
}

/**
 * Builds the RGBA displacement map for a glass element of the given size.
 * Returns { data, scale }: pass `scale` to feDisplacementMap so the encoded
 * channels map back to pixel offsets. `lens` forces the centre lens to that
 * strength whatever the size, so a large surface still bends across its body.
 */
export function buildGlassMap(width, height, radius, lens) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const hx = w / 2
  const hy = h / 2
  const bezel = glassBezel(w, h)
  const bz = bezel * 1.45
  const travel = bezel * 1.15 * 1.35
  const lensK = lens ?? 1 - smoothstep(LENS_FULL, LENS_NONE, Math.max(w, h) / 2)

  const dx = new Float32Array(w * h)
  const dy = new Float32Array(w * h)
  let peak = 0

  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - hy
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx
      const dist = sdRoundBox(px, py, hx, hy, radius)
      if (dist > 0) continue

      const t = -dist
      let ox = 0
      let oy = 0

      if (t < bz + 2) {
        const e = 0.75
        let gx = sdRoundBox(px + e, py, hx, hy, radius) - sdRoundBox(px - e, py, hx, hy, radius)
        let gy = sdRoundBox(px, py + e, hx, hy, radius) - sdRoundBox(px, py - e, hx, hy, radius)
        const glen = Math.hypot(gx, gy)
        if (glen > 1e-4) {
          gx /= glen
          gy /= glen
          const om = 1 - clamp(t / bz, 0, 1)
          const om4 = om ** 4
          const slope = Math.min(om ** 3 / Math.max(1 - om4, 1e-3) ** 0.75, 7)
          const nl = Math.hypot(gx * slope, gy * slope, 1)
          ;[ox, oy] = refractOffset((gx * slope) / nl, (gy * slope) / nl, 1 / nl, travel)
        }
      }

      if (lensK > 0) {
        const zr = Math.min(Math.hypot(px / hx, py / hy), 1)
        const zoom = LENS_ZOOM * (1 - zr * zr) * lensK
        ox -= px * zoom
        oy -= py * zoom
      }

      const i = y * w + x
      dx[i] = ox
      dy[i] = oy
      peak = Math.max(peak, Math.abs(ox), Math.abs(oy))
    }
  }

  /* feDisplacementMap offsets by scale * (channel - 0.5), so scale = 2 * peak
     lets the strongest offset use the full channel range. */
  const scale = Math.max(peak * 2, 1)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 128 + (dx[i] / scale) * 255
    data[i * 4 + 1] = 128 + (dy[i] / scale) * 255
    data[i * 4 + 2] = 128
    data[i * 4 + 3] = 255
  }

  return { data, scale, width: w, height: h }
}
