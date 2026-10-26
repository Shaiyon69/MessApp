// Vite-only (`?url` imports), so voiceAudioProcessing loads it lazily and
// `node --test` never resolves it.
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

let wasmBinaryPromise = null

/**
 * Routes a raw microphone track through RNNoise and returns the processed
 * track. Stopping the processed track also releases the microphone and the
 * audio graph.
 */
export async function attachRnnoise(rawTrack) {
  // RNNoise works on 48 kHz frames; a matching context avoids resampling.
  const ctx = new AudioContext({ sampleRate: 48000 })
  try {
    wasmBinaryPromise ||= loadRnnoise({ url: wasmUrl, simdUrl })
    const wasmBinary = await wasmBinaryPromise
    await ctx.audioWorklet.addModule(workletUrl)
    await ctx.resume()

    const source = ctx.createMediaStreamSource(new MediaStream([rawTrack]))
    const rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
    const destination = ctx.createMediaStreamDestination()
    source.connect(rnnoise).connect(destination)

    const track = destination.stream.getAudioTracks()[0]
    const stopTrack = track.stop.bind(track)
    track.stop = () => {
      stopTrack()
      rawTrack.stop()
      rnnoise.destroy()
      void ctx.close()
    }

    const setEnabled = enabled => {
      source.disconnect()
      source.connect(enabled ? rnnoise : destination)
    }

    return { track, setEnabled }
  } catch (error) {
    // A failed fetch must not poison later calls.
    wasmBinaryPromise = null
    void ctx.close()
    throw error
  }
}
