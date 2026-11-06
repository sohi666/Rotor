#!/usr/bin/env node
// Rotor: Daily Lock — procedural sound effects.
// Zero dependencies. Writes 44.1 kHz / 16-bit / mono PCM WAV files to assets/sfx/.
//
//   node scripts/assets/make-sfx.mjs        # (re)generate every sound
//   node scripts/assets/check-sfx.mjs       # verify format, duration, peak
//
// Everything is deterministic (seeded noise), so re-running produces identical files.
// Musical centre is G major, so unlock / combo / win chimes always sit together.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const PEAK_DBFS = -3;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'sfx');

// ---------------------------------------------------------------- utilities

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const N = {
  G3: midi(55), G4: midi(67), B4: midi(71), D5: midi(74), G5: midi(79), A5: midi(81),
  B5: midi(83), D6: midi(86), G6: midi(91), B6: midi(95), D7: midi(98), G7: midi(103),
  B7: midi(107), D8: midi(110),
};

const buffer = (seconds) => new Float64Array(Math.round(seconds * SR));

/** RBJ biquad, applied in place. type: lowpass | highpass | bandpass */
function biquad(x, type, f0, q = 0.707) {
  const w0 = (2 * Math.PI * f0) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
  else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
  else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; }
  else throw new Error(type);
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
  return x;
}

/** Mix src into dst starting at time t0 (seconds). */
function mix(dst, src, t0 = 0, gain = 1) {
  const off = Math.round(t0 * SR);
  for (let i = 0; i < src.length && off + i < dst.length; i++) if (off + i >= 0) dst[off + i] += src[i] * gain;
  return dst;
}

/** Short raised-cosine attack then exponential decay. */
const env = (t, attack, tau) =>
  t < 0 ? 0 : (t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1) * Math.exp(-t / tau);

/**
 * Damped sinusoid ("mode") — the building block of every mechanical resonance here.
 * opts.glide: multiply frequency by this ratio over opts.glideTime (pitch sweep).
 */
function mode(out, t0, freq, amp, tau, { attack = 0.0002, phase = 0, glide = 1, glideTime = 0.05 } = {}) {
  const start = Math.round(t0 * SR);
  const len = Math.min(out.length - start, Math.ceil(tau * 9 * SR));
  let ph = phase;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = glide === 1 ? freq : freq * glide ** Math.min(1, t / glideTime);
    ph += (2 * Math.PI * f) / SR;
    out[start + i] += amp * env(t, attack, tau) * Math.sin(ph);
  }
  return out;
}

/** Filtered noise burst with exponential decay. */
function noiseBurst(out, t0, amp, tau, filters, seed, attack = 0.0001) {
  const r = rng(seed);
  const n = buffer(Math.min(tau * 10, out.length / SR));
  for (let i = 0; i < n.length; i++) n[i] = (r() * 2 - 1) * env(i / SR, attack, tau);
  for (const [type, f, q] of filters) biquad(n, type, f, q);
  return mix(out, n, t0, amp);
}

/**
 * Pitched, struck-metal voice built from partials [ratio, relAmp, relTau].
 * A pair of slightly detuned copies of the fundamental gives a gentle shimmer.
 */
function strike(out, t0, f, amp, tau, partials, { attack = 0.0015, detune = 0.0015, phaseSeed = 1 } = {}) {
  const r = rng(phaseSeed);
  for (const [ratio, rel, relTau] of partials) {
    const fr = f * ratio;
    if (fr > SR * 0.45) continue;
    mode(out, t0, fr, amp * rel, tau * relTau, { attack, phase: r() * 6.283 });
  }
  if (detune) mode(out, t0, f * (1 + detune), amp * 0.35, tau * 0.9, { attack, phase: r() * 6.283 });
  return out;
}

// Timbres
const CHIME = [[1, 1, 1], [2, 0.28, 0.55], [3, 0.1, 0.35], [4.16, 0.07, 0.22], [6.8, 0.035, 0.06]];
const MARIMBA = [[1, 1, 1], [3.98, 0.32, 0.22], [9.9, 0.08, 0.08]];
const GLASS = [[1, 1, 1], [2.0, 0.22, 0.5], [5.04, 0.06, 0.15]];

/** Soft felt/wood mallet thump that starts a marimba note. */
function mallet(out, t0, amp, seed) {
  return noiseBurst(out, t0, amp, 0.0012, [['lowpass', 1800, 0.7], ['highpass', 180, 0.7]], seed);
}

/** Tiny high "glints" scattered over a window — the shimmer tail. */
function sparkle(out, t0, t1, count, amp, notes, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const t = t0 + (t1 - t0) * (i / count + r() * 0.6 / count);
    const f = notes[Math.floor(r() * notes.length)] * (1 + (r() - 0.5) * 0.004);
    const fall = 1 - 0.55 * (i / count); // glints thin out over time
    strike(out, t, f, amp * fall * (0.6 + 0.4 * r()), 0.09, GLASS, { attack: 0.003, detune: 0, phaseSeed: seed + i });
  }
  return out;
}

/**
 * Mechanical detent click: a noise transient + inharmonic "tooth" resonances
 * + a little housing body, followed by a micro-bounce of the pawl.
 */
function detent(out, t0, { pitch = 1, amp = 1, body = 1, bounce = 0.0045, bounceAmp = 0.22, bright = 1, seed = 1 } = {}) {
  const hit = (t, a, s) => {
    noiseBurst(out, t, 0.9 * a, 0.0005, [['bandpass', 3600 * pitch, 0.8], ['highpass', 900, 0.7]], s);
    mode(out, t, 2650 * pitch, 0.42 * a, 0.0055, { phase: 0.3 });
    mode(out, t, 4120 * pitch, 0.24 * a * bright, 0.0038, { phase: 1.1 });
    mode(out, t, 6930 * pitch, 0.1 * a * bright, 0.0022, { phase: 2.0 });
    mode(out, t, 820 * pitch, 0.2 * a * body, 0.005, { attack: 0.0006 });
  };
  hit(t0, amp, seed);
  if (bounceAmp) hit(t0 + bounce, amp * bounceAmp, seed + 101);
  return out;
}

/** Heavier bolt "clack" used for unlocks. */
function clack(out, t0, amp = 1, seed = 7) {
  noiseBurst(out, t0, 0.8 * amp, 0.0016, [['bandpass', 2000, 0.7], ['highpass', 400, 0.7]], seed);
  mode(out, t0, 1180, 0.38 * amp, 0.022, { phase: 0.4 });
  mode(out, t0, 2870, 0.22 * amp, 0.014, { phase: 1.3 });
  mode(out, t0, 4330, 0.12 * amp, 0.008, { phase: 2.2 });
  mode(out, t0, 430, 0.3 * amp, 0.016, { attack: 0.0008 });
  mode(out, t0, 210, 0.25 * amp, 0.02, { attack: 0.001 });
  // bolt seats a hair later
  noiseBurst(out, t0 + 0.016, 0.3 * amp, 0.001, [['bandpass', 2600, 0.8]], seed + 3);
  mode(out, t0 + 0.016, 1640, 0.14 * amp, 0.01);
  return out;
}

// ---------------------------------------------------------- finishing chain

function finish(x, { fadeIn = 0.0004, fadeOut = 0.004, lowpass = 0, highpass = 40 } = {}) {
  if (highpass) biquad(x, 'highpass', highpass, 0.707); // removes DC / sub rumble
  if (lowpass) biquad(x, 'lowpass', lowpass, 0.707);
  const fi = Math.max(1, Math.round(fadeIn * SR));
  const fo = Math.max(1, Math.round(fadeOut * SR));
  for (let i = 0; i < fi && i < x.length; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
  for (let i = 0; i < fo && i < x.length; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  x[0] = 0;
  x[x.length - 1] = 0;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 10 ** (PEAK_DBFS / 20) / peak : 1;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

function writeWav(path, x) {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16); // fmt chunk size
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); // byte rate
  h.writeUInt16LE(2, 32); // block align
  h.writeUInt16LE(16, 34); // bits per sample
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

// ------------------------------------------------------------------ sounds

const T0 = 0.0004; // let the tiny fade-in land on silence, not on the transient

const sounds = {
  // Ratchet tooth: ~30 ms. Three variants so rapid spins don't machine-gun.
  notch: () => finish(detent(buffer(0.03), T0, { pitch: 1, seed: 11 }), { fadeOut: 0.004, lowpass: 11000, highpass: 120 }),
  notch2: () => finish(detent(buffer(0.03), T0, { pitch: 1.07, bounce: 0.004, bounceAmp: 0.18, bright: 0.85, seed: 23 }), { fadeOut: 0.004, lowpass: 11000, highpass: 120 }),
  notch3: () => finish(detent(buffer(0.032), T0, { pitch: 0.93, body: 1.4, bounce: 0.005, bounceAmp: 0.26, bright: 0.9, seed: 37 }), { fadeOut: 0.004, lowpass: 10500, highpass: 120 }),

  // Bolt clack, then a rising fifth G5 -> D6.
  unlock: () => {
    const x = buffer(0.35);
    clack(x, T0, 1, 7);
    strike(x, 0.07, N.G5, 0.5, 0.16, CHIME, { phaseSeed: 3 });
    strike(x, 0.15, N.D6, 0.55, 0.13, CHIME, { phaseSeed: 4 });
    return finish(x, { fadeOut: 0.05, lowpass: 14000 });
  },

  // Two spokes: lighter clack, B5-D6-G6 arpeggio landing on a G5/G6 octave.
  combo2: () => {
    const x = buffer(0.5);
    clack(x, T0, 0.7, 9);
    strike(x, 0.05, N.B5, 0.42, 0.18, CHIME, { phaseSeed: 5 });
    strike(x, 0.11, N.D6, 0.44, 0.18, CHIME, { phaseSeed: 6 });
    strike(x, 0.17, N.G6, 0.5, 0.2, CHIME, { phaseSeed: 7 });
    strike(x, 0.17, N.G5, 0.22, 0.22, MARIMBA, { phaseSeed: 8 });
    sparkle(x, 0.22, 0.42, 4, 0.06, [N.D7, N.G7], 81);
    return finish(x, { fadeOut: 0.07, lowpass: 15000 });
  },

  // Three+ spokes: higher four-note run D6-G6-B6-D7 over a warm G5 bed, more glints.
  combo3: () => {
    const x = buffer(0.5);
    clack(x, T0, 0.6, 13);
    strike(x, 0.03, N.G5, 0.25, 0.3, MARIMBA, { phaseSeed: 9 });
    strike(x, 0.035, N.D6, 0.38, 0.16, CHIME, { phaseSeed: 10 });
    strike(x, 0.08, N.G6, 0.4, 0.16, CHIME, { phaseSeed: 11 });
    strike(x, 0.125, N.B6, 0.42, 0.17, CHIME, { phaseSeed: 12 });
    strike(x, 0.17, N.D7, 0.46, 0.2, CHIME, { phaseSeed: 13 });
    strike(x, 0.17, N.B5, 0.2, 0.22, MARIMBA, { phaseSeed: 14 });
    sparkle(x, 0.2, 0.44, 8, 0.07, [N.G7, N.B7, N.D8], 99);
    return finish(x, { fadeOut: 0.07, lowpass: 15000 });
  },

  // Warm marimba arpeggio G4-B4-D5-G5, then a bell chord with a soft shimmer tail.
  win: () => {
    const x = buffer(1.2);
    const run = [N.G4, N.B4, N.D5, N.G5];
    const level = [0.66, 0.58, 0.52, 0.5]; // lower notes overlap less and sound quieter on phones
    run.forEach((f, i) => {
      const t = T0 + i * 0.095;
      mallet(x, t, 0.12, 200 + i);
      strike(x, t, f, level[i], 0.34, MARIMBA, { attack: 0.002, phaseSeed: 20 + i });
    });
    const tc = 0.4;
    mallet(x, tc, 0.12, 300);
    strike(x, tc, N.G4, 0.3, 0.55, MARIMBA, { attack: 0.003, phaseSeed: 30 });
    strike(x, tc, N.B5, 0.3, 0.42, CHIME, { phaseSeed: 31 });
    strike(x, tc + 0.012, N.D6, 0.3, 0.42, CHIME, { phaseSeed: 32 });
    strike(x, tc + 0.024, N.G6, 0.34, 0.45, CHIME, { phaseSeed: 33 });
    sparkle(x, 0.46, 1.0, 12, 0.05, [N.D7, N.G7, N.B7, N.D8], 123);
    return finish(x, { fadeOut: 0.16, lowpass: 15000 });
  },

  // Soft muted thunk. Fundamental sweeps 300->170 Hz with a 2nd harmonic and
  // woody 460/720 Hz modes so it still reads on small phone speakers.
  deny: () => {
    const x = buffer(0.15);
    mode(x, T0, 300, 0.9, 0.032, { attack: 0.002, glide: 170 / 300, glideTime: 0.04 });
    mode(x, T0, 600, 0.32, 0.018, { attack: 0.002, glide: 340 / 600, glideTime: 0.04, phase: 0.7 });
    mode(x, T0, 460, 0.38, 0.012, { attack: 0.0015, phase: 1.5 });
    mode(x, T0, 720, 0.2, 0.008, { attack: 0.0015, phase: 2.1 });
    noiseBurst(x, T0, 0.35, 0.004, [['lowpass', 900, 0.7]], 5, 0.0008);
    return finish(x, { fadeIn: 0.001, fadeOut: 0.02, lowpass: 2200, highpass: 60 });
  },

  // Soft UI "tock" — rounder and lower than a notch.
  tap: () => {
    const x = buffer(0.04);
    mode(x, T0, 1420, 0.8, 0.006, { attack: 0.0005 });
    mode(x, T0, 2330, 0.22, 0.0032, { attack: 0.0005, phase: 1.0 });
    mode(x, T0, 540, 0.35, 0.008, { attack: 0.0007, phase: 0.4 });
    noiseBurst(x, T0, 0.3, 0.0008, [['lowpass', 3200, 0.7], ['highpass', 300, 0.7]], 17, 0.0003);
    return finish(x, { fadeIn: 0.0006, fadeOut: 0.006, lowpass: 6000, highpass: 120 });
  },

  // Key in a lock: pin click, a soft scrape while turning, bolt click, then a gentle rising tone.
  key: () => {
    const x = buffer(0.4);
    detent(x, 0.006, { pitch: 0.78, amp: 0.85, body: 1.3, bounceAmp: 0.15, seed: 41 });
    // scrape: quiet band-limited noise swelling between the clicks
    const r = rng(77);
    const scrape = buffer(0.12);
    for (let i = 0; i < scrape.length; i++) {
      const t = i / scrape.length;
      scrape[i] = (r() * 2 - 1) * Math.sin(Math.PI * t) ** 2 * (0.7 + 0.3 * Math.sin(2 * Math.PI * 38 * t));
    }
    biquad(scrape, 'bandpass', 2400, 1.2);
    biquad(scrape, 'lowpass', 4000, 0.7);
    mix(x, scrape, 0.02, 0.18);
    detent(x, 0.135, { pitch: 0.66, amp: 1, body: 1.6, bounceAmp: 0.25, bounce: 0.006, seed: 43 });
    mode(x, 0.135, 1180, 0.2, 0.02, { phase: 0.4 }); // a touch of bolt ring
    // rising tone D5 -> A5 with a slow swell
    const tone = buffer(0.25);
    let ph = 0;
    for (let i = 0; i < tone.length; i++) {
      const t = i / SR;
      const k = Math.min(1, t / 0.18);
      const f = N.D5 * (N.A5 / N.D5) ** (k * k * (3 - 2 * k));
      ph += (2 * Math.PI * f) / SR;
      const a = Math.min(1, t / 0.06) ** 2 * Math.exp(-Math.max(0, t - 0.07) / 0.09);
      tone[i] = a * (Math.sin(ph) + 0.18 * Math.sin(2 * ph + 0.5) + 0.05 * Math.sin(3 * ph + 1));
    }
    mix(x, tone, 0.15, 0.18);
    return finish(x, { fadeOut: 0.03, lowpass: 12000, highpass: 80 });
  },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, make] of Object.entries(sounds)) {
  const x = make();
  const path = join(OUT_DIR, `${name}.wav`);
  writeWav(path, x);
  console.log(`wrote ${path}  (${((x.length / SR) * 1000).toFixed(0)} ms)`);
}
