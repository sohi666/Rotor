#!/usr/bin/env node
// Verifies every WAV in assets/sfx: format, duration, peak, boundary samples, brightness.
//
//   node scripts/assets/check-sfx.mjs                 # print a stats table, exit 1 on failure
//   node scripts/assets/check-sfx.mjs --png out.png   # also draw a waveform contact sheet
//
// Zero dependencies (PNG is encoded with node:zlib).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'sfx');
const EXPECT = {
  notch: [25, 35], notch2: [25, 35], notch3: [25, 35], unlock: [300, 400], combo2: [450, 550],
  combo3: [450, 550], win: [1100, 1300], deny: [120, 180], tap: [30, 50], key: [350, 450],
};

function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not RIFF/WAVE');
  let off = 12, fmt, data;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  const samples = new Float64Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return { ...fmt, samples };
}

/** Power-spectrum centroid in Hz (radix-2 FFT over the zero-padded file). */
function centroid(x, rate) {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  re.set(x);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = a + len / 2;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  let num = 0, den = 0;
  for (let k = 1; k < n / 2; k++) {
    const p = re[k] ** 2 + im[k] ** 2;
    num += p * (k * rate) / n; den += p;
  }
  return num / den;
}

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const files = readdirSync(DIR).filter((f) => f.endsWith('.wav')).sort();
const rows = [];
let failed = false;

for (const f of files) {
  const name = f.replace(/\.wav$/, '');
  const w = parseWav(readFileSync(join(DIR, f)));
  const x = w.samples;
  let peak = 0, sum = 0, dc = 0;
  for (const v of x) { peak = Math.max(peak, Math.abs(v)); sum += v * v; dc += v; }
  const ms = (x.length / w.rate) * 1000;
  const edge = Math.max(Math.abs(x[0]), Math.abs(x[x.length - 1]));
  const problems = [];
  if (w.format !== 1 || w.channels !== 1 || w.rate !== 44100 || w.bits !== 16) problems.push('format');
  if (Math.abs(db(peak) + 3) > 0.25) problems.push('peak');
  if (edge > 0.001) problems.push('edge');
  const exp = EXPECT[name];
  if (exp && (ms < exp[0] || ms > exp[1])) problems.push('duration');
  if (problems.length) failed = true;
  rows.push({
    file: f, fmt: `${w.rate}/${w.bits}/${w.channels}ch`, ms: ms.toFixed(1), peak_dBFS: db(peak).toFixed(2),
    rms_dBFS: db(Math.sqrt(sum / x.length)).toFixed(1), dc: (dc / x.length).toExponential(1),
    first_last: `${x[0].toFixed(4)}/${x[x.length - 1].toFixed(4)}`, centroid_Hz: Math.round(centroid(x, w.rate)),
    ok: problems.length ? `FAIL(${problems.join(',')})` : 'ok', _x: x,
  });
}

console.table(rows.map(({ _x, ...r }) => r));

// ------------------------------------------------------------ waveform PNG
const pngArg = process.argv.indexOf('--png');
if (pngArg > -1) {
  const out = process.argv[pngArg + 1];
  const W = 900, H = 90, pad = 6;
  const height = rows.length * (H + pad) + pad;
  const img = Buffer.alloc(W * height * 3);
  const put = (x, y, [r, g, b]) => { const i = (y * W + x) * 3; img[i] = r; img[i + 1] = g; img[i + 2] = b; };
  for (let y = 0; y < height; y++) for (let x = 0; x < W; x++) put(x, y, [15, 82, 87]);
  rows.forEach((row, k) => {
    const top = pad + k * (H + pad);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, top + y, [242, 232, 213]);
    const x = row._x;
    // fixed timescale: full width = 1.2 s so lengths are comparable
    const spp = (1.2 * 44100) / W;
    for (let px = 0; px < W; px++) {
      const a = Math.floor(px * spp), b = Math.min(x.length, Math.floor((px + 1) * spp));
      if (a >= x.length) break;
      let lo = 0, hi = 0;
      for (let i = a; i < b; i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
      const y0 = Math.round(top + H / 2 - hi * (H / 2 - 2)), y1 = Math.round(top + H / 2 - lo * (H / 2 - 2));
      for (let y = y0; y <= y1; y++) put(px, y, [201, 151, 58]);
    }
    // -3 dBFS guide lines
    const g = Math.round((H / 2 - 2) * 0.708);
    for (let px = 0; px < W; px += 4) { put(px, top + H / 2 - g, [229, 72, 59]); put(px, top + H / 2 + g, [229, 72, 59]); }
  });
  const raw = Buffer.alloc((W * 3 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`waveforms (rows in table order, 1.2 s full width): ${out}`);
}

process.exit(failed ? 1 : 0);
