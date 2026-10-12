import { load, save } from './storage';

/*
 * Kleine Spieltöne, direkt im Browser erzeugt (keine Tondateien nötig).
 * Browser erlauben Ton erst nach einer Berührung; darum wird der AudioContext
 * beim ersten Tippen freigeschaltet.
 */

export type SoundName = 'tick' | 'pick' | 'whoosh' | 'count' | 'go' | 'challenge' | 'trap' | 'buy' | 'right' | 'wrong' | 'win' | 'lose' | 'chat' | 'found' | 'boo';

let ctx: AudioContext | null = null;
let enabled = load<boolean>('sound.v1', true);
const listeners = new Set<() => void>();

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Beim ersten Tippen freischalten (iOS braucht das)
const unlock = () => {
  if (!enabled) return;
  const a = audio();
  if (a) {
    const b = a.createBuffer(1, 1, 22050);
    const src = a.createBufferSource();
    src.buffer = b;
    src.connect(a.destination);
    src.start(0);
  }
  window.removeEventListener('pointerdown', unlock);
};
window.addEventListener('pointerdown', unlock);

export function soundOn() {
  return enabled;
}

export function setSoundOn(on: boolean) {
  enabled = on;
  save('sound.v1', on);
  if (on) audio();
  listeners.forEach((l) => l());
}

export function subscribeSound(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, endFreq?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(a: AudioContext, start: number, dur: number, gain = 0.12) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(400, start);
  f.frequency.exponentialRampToValueAtTime(3000, start + dur);
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(start);
}

/** Ton abspielen (still, wenn ausgeschaltet oder nicht möglich) */
export function play(name: SoundName) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (name) {
    case 'tick':
      tone(a, 1500, t, 0.035, 'square', 0.05);
      break;
    case 'pick':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.08, 0.18, 'triangle', 0.16));
      break;
    case 'whoosh':
      noise(a, t, 0.45, 0.16);
      break;
    case 'count':
      tone(a, 660, t, 0.16, 'square', 0.08);
      break;
    case 'go':
      tone(a, 880, t, 0.5, 'square', 0.1, 1320);
      break;
    case 'challenge':
      [0, 0.22].forEach((d) => {
        tone(a, 880, t + d, 0.1, 'square', 0.08);
        tone(a, 660, t + d + 0.1, 0.1, 'square', 0.08);
      });
      break;
    case 'trap':
      tone(a, 620, t, 0.4, 'sawtooth', 0.09, 180);
      break;
    case 'buy':
      tone(a, 1318, t, 0.08, 'sine', 0.16);
      tone(a, 1760, t + 0.07, 0.25, 'sine', 0.16);
      break;
    case 'right':
      tone(a, 660, t, 0.1, 'triangle', 0.16);
      tone(a, 990, t + 0.09, 0.2, 'triangle', 0.16);
      break;
    case 'wrong':
      tone(a, 220, t, 0.3, 'sawtooth', 0.08, 160);
      break;
    case 'chat':
      tone(a, 900, t, 0.07, 'sine', 0.12, 1200);
      break;
    case 'found':
    case 'win':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, f, t + i * 0.11, i === 4 ? 0.6 : 0.16, 'triangle', 0.17));
      break;
    case 'boo':
      // Kichernder Geist: kurzes Wackeln nach oben
      tone(a, 520, t, 0.16, 'sine', 0.14, 880);
      tone(a, 700, t + 0.12, 0.22, 'triangle', 0.1, 420);
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(a, f, t + i * 0.22, 0.3, 'triangle', 0.14));
      break;
  }
}

/** Vibrieren (falls das Gerät es kann und Töne an sind) */
export function buzz(pattern: number | number[]) {
  if (enabled) navigator.vibrate?.(pattern);
}
