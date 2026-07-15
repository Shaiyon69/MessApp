/**
 * Owns lazily initialized Web Audio nodes and app sound cues. Browser autoplay
 * policy requires user activation; generated nodes disconnect after use.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ringInterval = null;
    this.hasInteracted = false;
    this.resumePending = false;
    this.warned = new Set();
  }

  getSetting(key, fallback = true) {
    if (typeof localStorage === 'undefined') return fallback;
    return localStorage.getItem(key) !== 'false';
  }

  isMessageSoundEnabled() {
    return this.getSetting('messageSoundsEnabled', this.getSetting('soundEnabled', true));
  }

  isCallSoundEnabled() {
    return this.getSetting('callSoundsEnabled', true);
  }

  isRingtoneEnabled() {
    return this.getSetting('ringtoneSoundsEnabled', true);
  }

  getContext() {
    if (!this.hasInteracted) return null;
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.ctx) this.ctx = new AudioContextClass();
    return this.ctx;
  }

  async unlock() {
    this.hasInteracted = true;
    try {
      const ctx = this.getContext();
      if (!ctx) {
        this.warnOnce('unlock-no-context', '[SOUND_DEBUG] Audio unlock could not create an AudioContext.');
        return false;
      }
      if (ctx.state === 'suspended') await ctx.resume();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      return true;
    } catch (err) {
      this.warnOnce('unlock-failed', '[SOUND_DEBUG] Audio unlock failed.', err);
      return false;
    }
  }

  init() {
    try {
      const ctx = this.getContext();
      if (!ctx) {
        this.warnOnce('init-no-interaction', '[SOUND_DEBUG] Audio playback skipped until the first user gesture unlocks audio.');
        return false;
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    } catch (err) {
      this.warnOnce('init-failed', '[SOUND_DEBUG] Audio initialization failed.', err);
      return false;
    }
  }

  warnOnce(key, ...args) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(...args);
  }

  playTone(sequence, volume = 0.04) {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    if (!this.init()) return;
    try {
      if (this.ctx.state !== 'running') {
        if (!this.resumePending && this.ctx.state === 'suspended') {
          this.resumePending = true;
          this.ctx.resume()
            .then(() => { this.resumePending = false; this.playTone(sequence, volume); })
            .catch((err) => {
              this.resumePending = false;
              this.warnOnce('resume-blocked', '[SOUND_DEBUG] Sound playback was blocked by the browser.', err);
            });
        }
        return;
      }
      const t = this.ctx.currentTime;
      sequence.forEach(({ frequency, at = 0, duration = 0.1 }) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, t + at);

        gain.gain.setValueAtTime(0, t + at);
        gain.gain.linearRampToValueAtTime(volume, t + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + at + duration);

        osc.start(t + at);
        osc.stop(t + at + duration + 0.02);
      });
    } catch(err) {
      this.warnOnce('playback-failed', '[SOUND_DEBUG] Sound playback failed.', err);
    }
  }

  playPop() {
    this.playMessageReceived();
  }

  playMessageReceived() {
    if (!this.isMessageSoundEnabled()) return;
    this.playTone([
      { frequency: 800, duration: 0.08 },
      { frequency: 1200, at: 0.04, duration: 0.1 }
    ], 0.035);
  }

  playMessageSent() {
    if (!this.isMessageSoundEnabled()) return;
    this.playTone([
      { frequency: 660, duration: 0.07 },
      { frequency: 980, at: 0.05, duration: 0.08 }
    ], 0.025);
  }

  playCallConnected() {
    if (!this.isCallSoundEnabled()) return;
    this.playTone([
      { frequency: 440, duration: 0.08 },
      { frequency: 660, at: 0.09, duration: 0.1 }
    ], 0.035);
  }

  playCallEnded() {
    if (!this.isCallSoundEnabled()) return;
    this.playTone([
      { frequency: 520, duration: 0.08 },
      { frequency: 320, at: 0.08, duration: 0.13 }
    ], 0.03);
  }

  playCallFailed() {
    if (!this.isCallSoundEnabled()) return;
    this.playTone([
      { frequency: 260, duration: 0.12 },
      { frequency: 220, at: 0.14, duration: 0.14 }
    ], 0.035);
  }

  playVoiceJoined() {
    if (!this.isCallSoundEnabled()) return;
    this.playTone([
      { frequency: 392, duration: 0.06 },
      { frequency: 587, at: 0.07, duration: 0.08 },
      { frequency: 784, at: 0.15, duration: 0.1 }
    ], 0.028);
  }

  playVoiceLeft() {
    if (!this.isCallSoundEnabled()) return;
    this.playTone([
      { frequency: 587, duration: 0.06 },
      { frequency: 392, at: 0.07, duration: 0.11 }
    ], 0.026);
  }

  playScreenShareStarted() {
    if (!this.isCallSoundEnabled()) return;
    this.playTone([
      { frequency: 740, duration: 0.07 },
      { frequency: 988, at: 0.08, duration: 0.09 }
    ], 0.026);
  }

  playScreenShareStopped() {
    if (!this.isCallSoundEnabled()) return;
    this.playTone([{ frequency: 440, duration: 0.12 }], 0.024);
  }

  playReactionAdded() {
    if (!this.isMessageSoundEnabled()) return;
    this.playTone([{ frequency: 1400, duration: 0.06 }], 0.018);
  }

  startRing(isOutgoing) {
    this.stopRing();
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (!this.isRingtoneEnabled()) return;
    if (!this.init()) return;
    try {
      const vol = isOutgoing ? 0.01 : 0.05; 
      
      const ring = () => {
        if (!this.ctx || this.ctx.state !== 'running') return; 
        const t = this.ctx.currentTime;
        [523.25, 659.25, 880.00].forEach((freq, i) => { 
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain); gain.connect(this.ctx.destination);
          
          osc.type = 'sine'; 
          osc.frequency.setValueAtTime(freq, t + i * 0.15);
          
          gain.gain.setValueAtTime(0, t + i * 0.15);
          gain.gain.linearRampToValueAtTime(vol, t + i * 0.15 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.5);
          
          osc.start(t + i * 0.15); 
          osc.stop(t + i * 0.15 + 0.6);
        });
      };
      ring();
      this.ringInterval = setInterval(ring, 2000);
    } catch(_err) {}
  }

  stopRing() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  async test() {
    await this.unlock();
    this.playMessageSent();
    setTimeout(() => this.playMessageReceived(), 220);
    return true;
  }
}

export const audioSys = new SoundEngine();
if (typeof window !== 'undefined') window.MessAppSoundEngine = audioSys;
