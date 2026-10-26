import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyVoiceAudioProcessing,
  buildVoiceAudioConstraints,
  getVoiceMediaStream,
  tuneOpusSdp
} from './voiceAudioProcessing.js'

test('builds the strongest supported browser-native voice constraints', () => {
  assert.deepEqual(buildVoiceAudioConstraints(true, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: true,
    sampleRate: true,
    sampleSize: true,
    latency: true
  }), {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    latency: { ideal: 0.01 }
  })
})

test('omits processing constraints a browser reports as unsupported', () => {
  assert.deepEqual(buildVoiceAudioConstraints(true, {
    echoCancellation: true,
    noiseSuppression: false,
    channelCount: true
  }), {
    echoCancellation: true,
    channelCount: { ideal: 1 }
  })
})

test('respects independent echo cancellation and automatic gain preferences', () => {
  assert.deepEqual(buildVoiceAudioConstraints(true, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }, {
    echoCancellation: false,
    autoGainControl: false
  }), {
    echoCancellation: false,
    noiseSuppression: true,
    autoGainControl: false
  })
})

test('falls back to core constraints when enhanced capture is overconstrained', async () => {
  const calls = []
  const expectedStream = {
    id: 'stream',
    getAudioTracks: () => [{ readyState: 'live', enabled: true }],
    getTracks: () => []
  }
  const mediaDevices = {
    getSupportedConstraints: () => ({ echoCancellation: true, sampleRate: true }),
    getUserMedia: async constraints => {
      calls.push(constraints)
      if (calls.length === 1) {
        const error = new Error('unsupported sample rate')
        error.name = 'OverconstrainedError'
        throw error
      }
      return expectedStream
    }
  }

  assert.equal(await getVoiceMediaStream({ mediaDevices, video: true }), expectedStream)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].audio, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  })
})

test('rejects capture when the device returns no live microphone track', async () => {
  const stopped = []
  await assert.rejects(
    getVoiceMediaStream({
      mediaDevices: {
        getSupportedConstraints: () => ({}),
        getUserMedia: async () => ({
          getAudioTracks: () => [],
          getTracks: () => [{ stop: () => stopped.push(true) }]
        })
      }
    }),
    error => error.name === 'NotFoundError'
  )
  assert.equal(stopped.length, 1)
})

test('dynamic processing falls back without replacing the microphone track', async () => {
  const applied = []
  const track = {
    applyConstraints: async constraints => {
      applied.push(constraints)
      if (applied.length === 1) {
        const error = new Error('unsupported')
        error.name = 'TypeError'
        throw error
      }
    },
    getSettings: () => ({ noiseSuppression: true })
  }

  const settings = await applyVoiceAudioProcessing(track, true, {
    getSupportedConstraints: () => ({ echoCancellation: true, sampleRate: true })
  })

  assert.equal(applied.length, 2)
  assert.deepEqual(settings, { noiseSuppression: true })
})

test('tunes the Opus fmtp line and leaves other codecs alone', () => {
  const sdp = [
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 0',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=0;usedtx=1',
    'a=rtpmap:0 PCMU/8000',
    'a=fmtp:0 foo=1',
    ''
  ].join('\r\n')

  const lines = tuneOpusSdp(sdp).split('\r\n')
  assert.equal(lines[2], 'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=0;maxaveragebitrate=96000;maxplaybackrate=48000;stereo=0')
  assert.equal(lines[4], 'a=fmtp:0 foo=1')
  assert.equal(lines.length, 6)
})

test('adds an Opus fmtp line when the SDP has none', () => {
  const tuned = tuneOpusSdp('a=rtpmap:109 opus/48000/2\na=sendrecv')
  assert.equal(tuned, 'a=rtpmap:109 opus/48000/2\na=fmtp:109 maxaveragebitrate=96000;maxplaybackrate=48000;useinbandfec=1;usedtx=0;stereo=0\na=sendrecv')
})

test('leaves SDP without Opus unchanged', () => {
  const sdp = 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000'
  assert.equal(tuneOpusSdp(sdp), sdp)
  assert.equal(tuneOpusSdp(undefined), undefined)
})

test('live noise toggle keeps stored echo cancellation and gain settings', async () => {
  const applied = []
  const track = {
    applyConstraints: async constraints => { applied.push(constraints) },
    getSettings: () => ({})
  }
  await applyVoiceAudioProcessing(track, false, {
    getSupportedConstraints: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })
  })
  assert.deepEqual(applied[0], { echoCancellation: true, noiseSuppression: false, autoGainControl: true })
})
