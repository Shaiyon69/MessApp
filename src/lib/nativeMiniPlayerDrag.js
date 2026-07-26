import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeMiniPlayerDrag = registerPlugin('NativeMiniPlayerDrag')
let sequence = 0

export function shouldUseNativeMiniPlayerDrag({
  platform = Capacitor.getPlatform(),
  native = Capacitor.isNativePlatform(),
  pointerType,
  compact
} = {}) {
  return native && platform === 'android' && pointerType === 'touch' && compact
}

function nextDragId() {
  sequence += 1
  return `mini-player-${Date.now()}-${sequence}`
}

export async function beginNativeMiniPlayerDrag(options, onEnd) {
  if (!shouldUseNativeMiniPlayerDrag(options)) return null

  const id = nextDragId()
  let listenerHandle = null
  let closed = false

  const removeListener = async () => {
    const handle = listenerHandle
    listenerHandle = null
    if (!handle) return
    try {
      await handle.remove()
    } catch {
      // Native listener cleanup is best-effort during app/page teardown.
    }
  }

  const control = {
    id,
    active: false,
    async complete() {
      if (closed) return
      closed = true
      await removeListener()
      try {
        await NativeMiniPlayerDrag.completeDrag({ id })
      } catch {
        // The native overlay also has a timeout, so cleanup cannot strand it.
      }
    },
    async cancel() {
      if (closed) return
      closed = true
      await removeListener()
      try {
        await NativeMiniPlayerDrag.cancelDrag({ id })
      } catch {
        // Falling back to the DOM drag remains safe if the plugin disappeared.
      }
    }
  }

  try {
    listenerHandle = await NativeMiniPlayerDrag.addListener('dragEnd', (result) => {
      if (closed || result?.id !== id) return
      onEnd?.(result, control)
    })

    const result = await NativeMiniPlayerDrag.startDrag({
      ...options,
      id
    })
    control.active = result?.active === true

    if (!control.active) {
      await removeListener()
      closed = true
      return null
    }

    return control
  } catch {
    await removeListener()
    closed = true
    return null
  }
}
