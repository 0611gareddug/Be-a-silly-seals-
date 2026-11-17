// ===== 사운드: BGM(mp3) + 효과음(Web Audio 합성) =====
import { store } from './util.js';

const TRACKS = { title: 'audio/title.mp3', factory: 'audio/factory.mp3', rush: 'audio/rush.mp3' };

class AudioMan {
  constructor() {
    this.bgmVol = store.get('bgmVol', 0.5);
    this.sfxVol = store.get('sfxVol', 0.7);
    this.muted = store.get('muted', false);
    this.cur = null; this.curName = null; this.ctx = null; this.unlocked = false; this.want = null;
    this.els = {};
  }
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
    if (this.want) this.bgm(this.want, true);
  }
  el(name) {
    if (!this.els[name]) {
      const a = new Audio(TRACKS[name]);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      this.els[name] = a;
    }
    return this.els[name];
  }
  bgm(name, force) {
    this.want = name;
    if (!this.unlocked) return;
    if (this.curName === name && !force) return;
    const prev = this.cur;
    const next = this.el(name);
    this.curName = name; this.cur = next;
    if (prev && prev !== next) this.fade(prev, 0, () => prev.pause());
    if (next.paused) { try { next.currentTime = 0; } catch { /* 무시 */ } next.play().catch(() => {}); }
    this.fade(next, this.muted ? 0 : this.bgmVol);
  }
  fade(a, to, done) {
    clearInterval(a._fade);
    const from = a.volume, t0 = performance.now();
    a._fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 1000);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(a._fade); done && done(); }
    }, 50);
  }
  setBgmVol(v) { this.bgmVol = v; store.set('bgmVol', v); if (this.cur && !this.muted) this.cur.volume = v; }
  setSfxVol(v) { this.sfxVol = v; store.set('sfxVol', v); }
  toggleMute() {
    this.muted = !this.muted; store.set('muted', this.muted);
    if (this.cur) this.cur.volume = this.muted ? 0 : this.bgmVol;
    return this.muted;
  }
  pauseAll(p) { if (!this.cur) return; if (p) this.cur.pause(); else this.cur.play().catch(() => {}); }

  // ---- 효과음 ----
  tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol * this.sfxVol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.3, freq = 1200, delay = 0, q = 1) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    if (!this._nb) {
      const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._nb = b;
    }
    const s = c.createBufferSource(); s.buffer = this._nb;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol * this.sfxVol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t); s.stop(t + dur + 0.02);
  }
  sfx(k) {
    if (!this.ctx || this.muted || this.sfxVol <= 0) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    switch (k) {
      case 'seal': this.tone('square', 620, 260, 0.22, 0.12); this.tone('square', 520, 300, 0.18, 0.08, 0.2); break;
      case 'splash': this.noise(0.25, 0.35, 1800, 0, 0.7); this.tone('sine', 900, 300, 0.12, 0.12); break;
      case 'chop': this.noise(0.06, 0.4, 3000, 0, 2); this.noise(0.06, 0.35, 2600, 0.12, 2); break;
      case 'box': this.tone('triangle', 180, 90, 0.12, 0.35); this.noise(0.05, 0.2, 600); break;
      case 'drop': this.tone('triangle', 300, 120, 0.15, 0.25); break;
      case 'horn': this.tone('square', 392, 0, 0.18, 0.12); this.tone('square', 392, 0, 0.25, 0.12, 0.22); this.coin(0.3); break;
      case 'coin': this.coin(0); break;
      case 'order': this.tone('square', 880, 0, 0.07, 0.1); this.tone('square', 1320, 0, 0.1, 0.1, 0.08); break;
      case 'siren': for (let i = 0; i < 3; i++) { this.tone('sawtooth', 700, 1100, 0.3, 0.09, i * 0.33); } break;
      case 'stamp': this.noise(0.18, 0.6, 200, 0, 0.8); this.tone('sine', 120, 50, 0.25, 0.5); break;
      case 'meow': this.tone('sawtooth', 700, 1100, 0.12, 0.08); this.tone('sawtooth', 1100, 600, 0.2, 0.08, 0.12); break;
      case 'boing': this.tone('sine', 220, 660, 0.14, 0.3); break;
      case 'click': this.tone('square', 1200, 0, 0.03, 0.06); break;
      case 'type': this.tone('square', 420 + Math.random() * 120, 0, 0.025, 0.04); break;
      case 'fail': this.tone('square', 300, 150, 0.25, 0.12); break;
      case 'ok': this.tone('square', 660, 0, 0.08, 0.1); this.tone('square', 990, 0, 0.12, 0.1, 0.08); break;
      case 'upgrade': [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, 0, 0.09, 0.09, i * 0.07)); break;
      case 'unlock': this.noise(0.5, 0.5, 300, 0, 0.5); [392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, 0, 0.15, 0.2, 0.3 + i * 0.09)); break;
      case 'toy': this.tone('sine', 500, 800, 0.1, 0.15); break;
      case 'faint': this.tone('sawtooth', 600, 80, 0.7, 0.15); break;
      case 'sabotage': this.tone('sawtooth', 200, 80, 0.4, 0.15); this.noise(0.3, 0.2, 900); break;
      case 'fix': [784, 988].forEach((f, i) => this.tone('square', f, 0, 0.08, 0.1, i * 0.08)); break;
      case 'start': [523, 659, 784].forEach((f, i) => this.tone('square', f, 0, 0.12, 0.1, i * 0.12)); this.tone('square', 1047, 0, 0.3, 0.1, 0.36); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, 0, 0.14, 0.1, i * 0.13)); break;
      case 'tick': this.tone('square', 1500, 0, 0.03, 0.05); break;
      case 'warnBeep': this.tone('square', 880, 0, 0.1, 0.12); break;
    }
  }
  coin(d) { this.tone('square', 988, 0, 0.06, 0.1, d); this.tone('square', 1319, 0, 0.12, 0.1, d + 0.06); }
}

export const audio = new AudioMan();
