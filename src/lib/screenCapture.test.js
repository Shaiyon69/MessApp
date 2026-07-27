import test from 'node:test'
import assert from 'node:assert/strict'
import { getScreenCaptureErrorMessage, getScreenCaptureStream } from './screenCapture.js'

test('screen capture requests display audio when the platform supports it', async () => {
  const calls = []
  const stream = { id: 'screen-1' }
  const result = await getScreenCaptureStream({
    getDisplayMedia: async constraints => {
      calls.push(constraints)
      return stream
    }
  })
  assert.equal(result, stream)
  assert.deepEqual(calls, [{ video: true, audio: true }])
})

test('screen capture retries video-only when display audio is unsupported', async () => {
  const calls = []
  const stream = { id: 'screen-2' }
  const result = await getScreenCaptureStream({
    getDisplayMedia: async constraints => {
      calls.push(constraints)
      if (constraints.audio) throw new DOMException('Audio unsupported', 'NotSupportedError')
      return stream
    }
  })
  assert.equal(result, stream)
  assert.deepEqual(calls, [
    { video: true, audio: true },
    { video: true, audio: false }
  ])
})

test('permission denial is not retried and gets a clear message', async () => {
  let callCount = 0
  await assert.rejects(
    getScreenCaptureStream({
      getDisplayMedia: async () => {
        callCount += 1
        throw new DOMException('Denied', 'NotAllowedError')
      }
    }),
    { name: 'NotAllowedError' }
  )
  assert.equal(callCount, 1)
  assert.match(getScreenCaptureErrorMessage({ name: 'NotAllowedError' }), /cancelled or blocked/i)
})
