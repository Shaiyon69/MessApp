export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ringInterval = null;
    this.hasInteracted = false; 
    
    this.unlockHandler = () => {
      this.hasInteracted = true;
      document.removeEventListener('click', this.unlockHandler);
      document.removeEventListener('touchstart', this.unlockHandler);
    };
    
    document.addEventListener('click', this.unlockHandler, { once: true });
    document.addEventListener('touchstart', this.unlockHandler, { once: true });
  }

  init() {
    if (!this.hasInteracted) return false; 
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {}); 
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  playPop() {
    if (!this.init()) return; 
    try {
      if (this.ctx.state !== 'running') return; 
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain); 
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05); 
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.01); 
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      
      osc.start(t); 
      osc.stop(t + 0.1);
    } catch(_err) {}
  }

  startRing(isOutgoing) {
    if (!this.init()) return; 
    try {
      this.stopRing();
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
}

export const audioSys = new SoundEngine();
