// Synthesized game SFX (Web Audio, no audio files). Silent until the first user gesture,
// and gated by the member's `prefs.sound` plus a local mute toggle.
import { createStore, storage, useStore } from './util';

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let unlocked = false;

export const soundStore = createStore<{ pref: boolean; muted: boolean }>({
  pref: true,
  muted: storage.get('cb.muted') === '1',
});
export const useSound = () => useStore(soundStore);
export function setSoundPref(pref: boolean): void { soundStore.set((s) => (s.pref === pref ? s : { ...s, pref })); }
export function setMuted(muted: boolean): void { storage.set('cb.muted', muted ? '1' : '0'); soundStore.set((s) => ({ ...s, muted })); }
const enabled = () => { const s = soundStore.get(); return unlocked && s.pref && !s.muted; };

export function initSfx(): void {
  const unlock = () => {
    unlocked = true;
    try {
      if (!ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp).connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume();
    } catch { /* audio unavailable */ }
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {}): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? 'sine';
  const t0 = ctx.currentTime + start;
  o.frequency.setValueAtTime(freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const peak = opts.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(start: number, dur: number, opts: { freq?: number; q?: number; gain?: number; type?: BiquadFilterType } = {}): void {
  if (!ctx || !master) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 1800;
  f.Q.value = opts.q ?? 0.8;
  const g = ctx.createGain();
  g.gain.value = opts.gain ?? 0.4;
  src.connect(f).connect(g).connect(master);
  const t0 = ctx.currentTime + start;
  src.start(t0);
  src.stop(t0 + dur);
}

const play = (fn: () => void) => () => { if (enabled()) try { fn(); } catch { /* ignore */ } };

export const sfx = {
  /** Mission deployed: quick rising blip + radar ping. */
  deploy: play(() => {
    tone(520, 0, 0.09, { type: 'triangle', to: 1040, gain: 0.35 });
    tone(1568, 0.1, 0.5, { type: 'sine', gain: 0.22 });
    tone(1568, 0.28, 0.4, { type: 'sine', gain: 0.07 });
  }),
  /** Mission complete: punchy hit + bright two-note confirm. */
  hit: play(() => {
    tone(150, 0, 0.18, { type: 'sine', to: 55, gain: 0.7 });
    noise(0, 0.12, { freq: 2400, q: 0.6, gain: 0.35 });
    tone(880, 0.04, 0.22, { type: 'triangle', gain: 0.3 });
    tone(1318.5, 0.1, 0.32, { type: 'triangle', gain: 0.28 });
  }),
  coin: play(() => {
    tone(987.8, 0, 0.08, { type: 'square', gain: 0.12 });
    tone(1318.5, 0.07, 0.28, { type: 'square', gain: 0.12 });
  }),
  bonus: play(() => {
    tone(1175, 0, 0.12, { type: 'triangle', gain: 0.22 });
    tone(1568, 0.06, 0.2, { type: 'triangle', gain: 0.2 });
  }),
  levelUp: play(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.32, { type: 'triangle', gain: 0.28 }));
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f) => tone(f, 0.42, 1.2, { type: 'sine', gain: 0.12, attack: 0.03 }));
    noise(0.4, 0.9, { freq: 6000, q: 0.4, gain: 0.08, type: 'highpass' });
  }),
  sectorCleared: play(() => {
    tone(98, 0, 0.6, { type: 'sine', to: 49, gain: 0.6 });
    [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.15 + i * 0.12, 0.5, { type: 'sawtooth', gain: 0.06 }));
    [523.25, 783.99, 1046.5].forEach((f) => tone(f, 0.7, 1.4, { type: 'triangle', gain: 0.16, attack: 0.05 }));
  }),
  crateShake: play(() => {
    for (let i = 0; i < 6; i++) noise(i * 0.09, 0.05, { freq: 300 + i * 60, q: 2, gain: 0.35 });
  }),
  crateOpen: play(() => {
    noise(0, 0.5, { freq: 900, q: 0.3, gain: 0.35, type: 'lowpass' });
    tone(220, 0, 0.3, { type: 'sine', to: 880, gain: 0.25 });
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.25 + i * 0.05, 0.6, { type: 'triangle', gain: 0.12 }));
  }),
  tick: play(() => tone(1900, 0, 0.03, { type: 'square', gain: 0.05 })),
  undo: play(() => tone(660, 0, 0.12, { type: 'triangle', to: 330, gain: 0.2 })),
  error: play(() => { tone(180, 0, 0.18, { type: 'sawtooth', gain: 0.12 }); tone(140, 0.12, 0.2, { type: 'sawtooth', gain: 0.12 }); }),
};
