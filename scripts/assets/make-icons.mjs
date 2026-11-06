#!/usr/bin/env node
// Rotor: Daily Lock — icon, splash, favicon and store artwork.
//
//   node scripts/assets/make-icons.mjs                    # write SVG/HTML sources + render all PNGs
//   node scripts/assets/make-icons.mjs --preview <dir>    # also write small-size review sheets
//
// Sources are written to scripts/assets/svg/ (generated from the dial() function below, so edit
// this file, not the .svg files). PNGs are rendered with Playwright/Chromium. The only other
// dependency is node:zlib (used to strip the alpha channel from the iOS icon).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const ASSETS = join(ROOT, 'assets');
const SRC = join(HERE, 'svg');

const FONT_UNBOUNDED = join(ROOT, 'node_modules/@expo-google-fonts/unbounded/700Bold/Unbounded_700Bold.ttf');
const FONT_FIGTREE = join(ROOT, 'node_modules/@expo-google-fonts/figtree/600SemiBold/Figtree_600SemiBold.ttf');

// ------------------------------------------------------------------ palette
export const C = {
  petrol: '#0F5257', petrolDeep: '#0A3B3F',
  ivory: '#F2E8D5', taupe: '#E2D5BC', groove: '#CDBE9F',
  brass: '#C9973A', brassLight: '#E6C27A',
  tomato: '#E5483B', marigold: '#F2A93B', leaf: '#3FA34D', cobalt: '#2F5FD0', plum: '#8E44AD', rose: '#F07AA8',
};

/** Blend two hex colours (t=0 -> a, t=1 -> b). Used only for shading derived from the palette. */
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------- dial geometry
// Unit dial: radius 500 around (0,0). Angles are degrees clockwise from 12 o'clock.
const G = {
  rim: 500, lip: 432, face: 424, hub: 62,
  tracks: [{ r: 140, w: 96 }, { r: 250, w: 96 }, { r: 360, w: 96 }], // inner -> outer
  pin: 38, // pin radius on the lit spoke = pin * litScale, elsewhere pin * dimScale
  litScale: 1.2, dimScale: 0.85,
  spokes: 6,
  offset: 30, // spokes at 1, 3, 5, 7, 9, 11 o'clock — none vertical
  aligned: 0, // spoke index that is lined up (1 o'clock)
  bloom: 0.7, // opacity of the wide glow along the lit spoke
  core: 22, // width of the solid beam joining the lit pins
};

// Pins per track (inner -> outer), one entry per spoke starting at the aligned spoke
// (1, 3, 5, 7, 9, 11 o'clock). Only three enamel colours, and a sparse, deliberately
// asymmetric scatter of "unsolved" pins so nothing competes with the lit spoke.
const T = 'tomato', M = 'marigold', B = 'cobalt';
const PINS = [
  [T, B, null, M, null, null],
  [T, null, M, null, B, M],
  [T, M, B, B, null, null],
];

const f1 = (n) => +n.toFixed(2);
const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [f1(r * Math.sin(a)), f1(-r * Math.cos(a))];
};
const spokeAngle = (k) => G.offset + (k * 360) / G.spokes;

/**
 * The dial mark as an SVG <g> in unit coordinates.
 * opts.detail: 'full' (bezel ticks, brass pin cups, specular) | 'small' (bolder, fewer marks)
 * opts.shadow: drop shadow under the dial (for petrol backgrounds)
 * opts.id: prefix so several dials can live in one document
 */
function dial({ detail = 'full', shadow = true, id = 'd' } = {}) {
  const full = detail === 'full';
  const brassDark = mix(C.brass, C.petrolDeep, 0.38);
  const brassDeep = mix(C.brass, C.petrolDeep, 0.55);
  const aAng = spokeAngle(G.aligned);
  const defs = `
    <linearGradient id="${id}-brass" x1="0.18" y1="0.04" x2="0.82" y2="0.96">
      <stop offset="0" stop-color="${C.brassLight}"/>
      <stop offset="0.48" stop-color="${C.brass}"/>
      <stop offset="1" stop-color="${brassDark}"/>
    </linearGradient>
    <linearGradient id="${id}-brass-rev" x1="0.82" y1="0.96" x2="0.18" y2="0.04">
      <stop offset="0" stop-color="${C.brassLight}"/>
      <stop offset="0.55" stop-color="${C.brass}"/>
      <stop offset="1" stop-color="${brassDark}"/>
    </linearGradient>
    <radialGradient id="${id}-face" cx="0.42" cy="0.36" r="0.72">
      <stop offset="0" stop-color="${C.ivory}"/>
      <stop offset="0.78" stop-color="${C.ivory}"/>
      <stop offset="1" stop-color="${mix(C.ivory, C.taupe, 0.7)}"/>
    </radialGradient>
    <radialGradient id="${id}-enamel" cx="0.36" cy="0.3" r="0.8">
      <stop offset="0" stop-color="${C.ivory}" stop-opacity="0.5"/>
      <stop offset="0.38" stop-color="${C.ivory}" stop-opacity="0"/>
      <stop offset="0.82" stop-color="${C.petrolDeep}" stop-opacity="0"/>
      <stop offset="1" stop-color="${C.petrolDeep}" stop-opacity="0.28"/>
    </radialGradient>
    <radialGradient id="${id}-hub" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="${C.brassLight}"/>
      <stop offset="0.6" stop-color="${C.brass}"/>
      <stop offset="1" stop-color="${brassDark}"/>
    </radialGradient>
    <linearGradient id="${id}-beam" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${C.rose}" stop-opacity="0.2"/>
      <stop offset="0.25" stop-color="${C.rose}" stop-opacity="0.85"/>
      <stop offset="0.85" stop-color="${C.tomato}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${C.tomato}" stop-opacity="0"/>
    </linearGradient>
    <filter id="${id}-blur-xl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${full ? 26 : 30}"/></filter>
    <filter id="${id}-blur-l" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="${id}-blur-m" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="${id}-blur-s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <clipPath id="${id}-faceclip"><circle r="${G.face}"/></clipPath>`;

  const out = [];
  if (shadow) {
    out.push(`<circle cy="26" r="${G.rim}" fill="${C.petrolDeep}" opacity="0.7" filter="url(#${id}-blur-xl)"/>`);
  }

  // Brass bezel
  out.push(`<circle r="${G.rim}" fill="url(#${id}-brass)"/>`);
  out.push(`<circle r="${G.rim - 4}" fill="none" stroke="${C.brassLight}" stroke-width="5" opacity="0.55"/>`);
  if (full) {
    const ticks = [];
    for (let i = 0; i < 60; i++) {
      const a = i * 6 + G.offset;
      const major = i % 5 === 0;
      const [x1, y1] = polar(major ? 446 : 454, a);
      const [x2, y2] = polar(major ? 486 : 480, a);
      ticks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${major ? 7 : 4}"/>`);
    }
    out.push(`<g stroke="${brassDeep}" stroke-linecap="round" opacity="0.5">${ticks.join('')}</g>`);
  }
  // Lip + face
  out.push(`<circle r="${G.lip}" fill="url(#${id}-brass-rev)"/>`);
  out.push(`<circle r="${G.face}" fill="url(#${id}-face)"/>`);

  // Everything on the face is clipped to it.
  const face = [];
  // Ring tracks with groove edges
  for (const t of G.tracks) {
    face.push(`<circle r="${t.r}" fill="none" stroke="${C.taupe}" stroke-width="${t.w}"/>`);
    face.push(`<circle r="${t.r - t.w / 2}" fill="none" stroke="${C.groove}" stroke-width="${full ? 4 : 7}"/>`);
    face.push(`<circle r="${t.r + t.w / 2}" fill="none" stroke="${C.groove}" stroke-width="${full ? 4 : 7}"/>`);
  }
  // Spokes (engraved hairlines)
  for (let k = 0; k < G.spokes; k++) {
    if (k === G.aligned) continue;
    const [x1, y1] = polar(G.hub + 10, spokeAngle(k));
    const [x2, y2] = polar(G.face, spokeAngle(k));
    face.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.groove}" stroke-width="${full ? 5 : 8}"/>`);
  }
  // Inner shadow from the bezel (light from top-left)
  face.push(`<circle cx="-6" cy="-10" r="${G.face + 22}" fill="none" stroke="${C.petrolDeep}" stroke-width="34" opacity="0.2" filter="url(#${id}-blur-l)"/>`);

  // Glow along the aligned spoke: a wide warm bloom, a softer beam, and a solid core that
  // links the lit pins into one chain (it starts under the inner pin, so nothing pokes out).
  const r0 = G.tracks[0].r, r1 = G.tracks[G.tracks.length - 1].r;
  face.push(`<g transform="rotate(${aAng})">
      <rect x="-80" y="${-G.face - 30}" width="160" height="${G.face - G.hub + 40}" rx="80" fill="${C.tomato}" opacity="${G.bloom * 0.55}" filter="url(#${id}-blur-xl)"/>
      <rect x="-60" y="${-G.face}" width="120" height="${G.face - G.hub}" rx="60" fill="${C.rose}" opacity="${G.bloom * 0.6}" filter="url(#${id}-blur-xl)"/>
      <rect x="-${G.core * 1.5}" y="${-G.face + 4}" width="${G.core * 3}" height="${G.face - r0 - 4}" rx="${G.core * 1.5}" fill="url(#${id}-beam)" filter="url(#${id}-blur-m)"/>
      <rect x="-${G.core / 2}" y="${-r1}" width="${G.core}" height="${r1 - r0}" rx="${G.core / 2}" fill="${C.tomato}"/>
    </g>`);
  out.push(`<g clip-path="url(#${id}-faceclip)">${face.join('')}</g>`);

  // Pins
  const pins = [];
  PINS.forEach((row, ti) => {
    row.forEach((col, k) => {
      if (!col) return;
      const [x, y] = polar(G.tracks[ti].r, spokeAngle(k));
      const lit = k === G.aligned;
      const pr = G.pin * (lit ? G.litScale : G.dimScale);
      const g = [];
      if (lit) g.push(`<circle cx="${x}" cy="${y}" r="${pr * 1.75}" fill="${C.rose}" opacity="0.7" filter="url(#${id}-blur-l)"/>`);
      g.push(`<circle cx="${x}" cy="${y + 6}" r="${pr + 4}" fill="${C.petrolDeep}" opacity="0.28" filter="url(#${id}-blur-s)"/>`);
      if (full) g.push(`<circle cx="${x}" cy="${y}" r="${pr + 6}" fill="url(#${id}-brass)"/>`);
      g.push(`<circle cx="${x}" cy="${y}" r="${pr}" fill="${C[col]}"/>`);
      g.push(`<circle cx="${x}" cy="${y}" r="${pr}" fill="url(#${id}-enamel)"/>`);
      g.push(`<ellipse cx="${f1(x - pr * 0.32)}" cy="${f1(y - pr * 0.38)}" rx="${f1(pr * 0.34)}" ry="${f1(pr * 0.2)}" transform="rotate(-32 ${f1(x - pr * 0.32)} ${f1(y - pr * 0.38)})" fill="${C.ivory}" opacity="${lit ? 0.85 : 0.7}"/>`);
      pins.push({ lit, svg: g.join('') });
    });
  });
  // Lit pins last so their halo sits above neighbours
  out.push(pins.filter((p) => !p.lit).map((p) => p.svg).join(''));
  out.push(pins.filter((p) => p.lit).map((p) => p.svg).join(''));

  // Hub (brass knob with axle)
  out.push(`<circle cy="6" r="${G.hub + 4}" fill="${C.petrolDeep}" opacity="0.3" filter="url(#${id}-blur-s)"/>`);
  out.push(`<circle r="${G.hub}" fill="url(#${id}-hub)"/>`);
  out.push(`<circle r="${G.hub - 3}" fill="none" stroke="${C.brassLight}" stroke-width="4" opacity="0.6"/>`);
  out.push(`<circle r="${full ? 17 : 20}" fill="${C.petrolDeep}"/>`);

  return { defs, body: out.join('\n') };
}

/** Single-colour silhouette for Android 13 themed icons (white + alpha only). */
function dialMono() {
  const out = [];
  const W = '#FFFFFF';
  const aAng = spokeAngle(G.aligned);
  // Bezel ring
  out.push(`<circle r="${(G.rim + G.lip) / 2}" fill="none" stroke="${W}" stroke-width="${G.rim - G.lip}"/>`);
  // Faint face so the dial reads as a solid object, then the lit spoke and the scattered pins
  out.push(`<circle r="${G.face}" fill="${W}" fill-opacity="0.16"/>`);
  out.push(`<g transform="rotate(${aAng})"><rect x="-14" y="${-G.tracks[2].r}" width="28" height="${G.tracks[2].r - G.hub + 10}" rx="14" fill="${W}"/></g>`);
  PINS.forEach((row, ti) => row.forEach((col, k) => {
    if (!col) return;
    const [x, y] = polar(G.tracks[ti].r, spokeAngle(k));
    if (k === G.aligned) out.push(`<circle cx="${x}" cy="${y}" r="${G.pin * G.litScale + 4}" fill="${W}"/>`);
    else out.push(`<circle cx="${x}" cy="${y}" r="${G.pin * G.dimScale}" fill="${W}" fill-opacity="0.5"/>`);
  }));
  // Hub with axle hole
  out.push(`<mask id="m-hub"><rect x="-600" y="-600" width="1200" height="1200" fill="#fff"/><circle r="20" fill="#000"/></mask>`);
  out.push(`<circle r="${G.hub}" fill="${W}" mask="url(#m-hub)"/>`);
  return out.join('\n');
}

// ---------------------------------------------------------------- documents
const petrolBg = (id, w, h, cx = 0.42, cy = 0.38) => ({
  defs: `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.85" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="${C.petrol}"/>
      <stop offset="0.55" stop-color="${C.petrol}"/>
      <stop offset="1" stop-color="${C.petrolDeep}"/>
    </radialGradient>`,
  body: `<rect width="${w}" height="${h}" fill="url(#${id})"/>`,
});

const svgDoc = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<defs>${defs}</defs>\n${body}\n</svg>\n`;

/** Place the unit dial at (cx, cy) with outer radius R. */
const place = (d, cx, cy, R) => `<g transform="translate(${cx} ${cy}) scale(${R / G.rim})">${d.body}</g>`;

function iconSvg({ R = 432, detail = 'full' } = {}) {
  const bg = petrolBg('bg', 1024, 1024);
  const d = dial({ detail, id: 'd' });
  return svgDoc(1024, 1024, bg.defs + d.defs, bg.body + place(d, 512, 512, R));
}

const docs = {
  icon: () => iconSvg(),
  'android-icon-foreground': () => {
    const d = dial({ id: 'd' }); // 300 px radius: inside the 66 dp (61%) mask circle with room for the shadow
    return svgDoc(1024, 1024, d.defs, place(d, 512, 512, 300));
  },
  'android-icon-background': () => {
    const bg = petrolBg('bg', 1024, 1024, 0.5, 0.42);
    return svgDoc(1024, 1024, bg.defs, bg.body);
  },
  'android-icon-monochrome': () => svgDoc(1024, 1024, '', `<g transform="translate(512 512) scale(${300 / G.rim})">${dialMono()}</g>`),
  'splash-icon': () => {
    const d = dial({ id: 'd' }); // shadow + glow stay inside the canvas
    return svgDoc(1024, 1024, d.defs, place(d, 512, 500, 440));
  },
  favicon: () => {
    const d = dial({ detail: 'small', shadow: false, id: 'd' });
    return svgDoc(1024, 1024, d.defs, place(d, 512, 512, 506));
  },
};

function featureHtml() {
  const W = 1024, H = 500;
  const d = dial({ id: 'd' });
  const bg = petrolBg('bg', W, H, 0.26, 0.5);
  const cx = 258, cy = 250, R = 196;
  // faint engraved orbit rings around the dial
  const rings = [250, 320, 400, 490, 590]
    .map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.brassLight}" stroke-opacity="${(0.09 - i * 0.014).toFixed(3)}" stroke-width="2"/>`)
    .join('');
  const art = svgDoc(W, H, bg.defs + d.defs, bg.body + rings + place(d, cx, cy, R));
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'Unbounded'; font-weight: 700; src: url('${pathToFileURL(FONT_UNBOUNDED)}') format('truetype'); }
  @font-face { font-family: 'Figtree'; font-weight: 600; src: url('${pathToFileURL(FONT_FIGTREE)}') format('truetype'); }
  html, body { margin: 0; background: ${C.petrol}; }
  #frame { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
  #frame > svg { position: absolute; inset: 0; }
  #type { position: absolute; left: 520px; top: 0; height: ${H}px; display: flex; flex-direction: column; justify-content: center; }
  #name { font: 700 128px/1 'Unbounded'; color: ${C.ivory}; letter-spacing: -0.01em; margin: 0 0 0 -6px; }
  #rule { width: 56px; height: 4px; border-radius: 2px; background: ${C.brass}; margin: 30px 0 22px 2px; }
  #tag { font: 600 50px/1 'Figtree'; color: ${C.ivory}; letter-spacing: 0.005em; margin: 0; }
</style></head>
<body><div id="frame">${art}<div id="type"><div id="name">Rotor</div><div id="rule"></div><div id="tag">Daily Lock</div></div></div></body></html>
`;
}

// --------------------------------------------------------- PNG alpha strip
/** Re-encode an 8-bit RGBA PNG as RGB (App Store icons must not have an alpha channel). */
function pngDropAlpha(buf, matte = C.petrol) {
  let off = 8, w, h, bitDepth, colorType;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12]) throw new Error('interlaced PNG'); }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('expected 8-bit PNG');
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const m = [1, 3, 5].map((i) => parseInt(matte.slice(i, i + 2), 16));
  const rgb = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    rgb[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = y * stride + x * bpp, o = y * (w * 3 + 1) + 1 + x * 3;
      const al = bpp === 4 ? px[s + 3] / 255 : 1;
      for (let ch = 0; ch < 3; ch++) rgb[o + ch] = Math.round(px[s + ch] * al + m[ch] * (1 - al));
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rgb, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ render
async function renderSvg(page, svg, size, path, { transparent = true } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Scale the 1024 artwork to the requested size as vectors (sharp at every size).
  const scaled = svg.replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${scaled}</body></html>`);
  const png = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(path, png);
  return png;
}

async function main() {
  const previewArg = process.argv.indexOf('--preview');
  const previewDir = previewArg > -1 ? resolve(process.argv[previewArg + 1]) : null;
  mkdirSync(SRC, { recursive: true });
  mkdirSync(join(ASSETS, 'store'), { recursive: true });

  const svgs = Object.fromEntries(Object.entries(docs).map(([k, fn]) => [k, fn()]));
  for (const [k, s] of Object.entries(svgs)) writeFileSync(join(SRC, `${k}.svg`), s);
  const featurePath = join(SRC, 'play-feature-graphic.html');
  writeFileSync(featurePath, featureHtml());

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  const iconPng = await renderSvg(page, svgs.icon, 1024, join(ASSETS, 'icon.png'), { transparent: false });
  writeFileSync(join(ASSETS, 'icon.png'), pngDropAlpha(iconPng));
  await renderSvg(page, svgs['android-icon-foreground'], 1024, join(ASSETS, 'android-icon-foreground.png'));
  const bgPng = await renderSvg(page, svgs['android-icon-background'], 1024, join(ASSETS, 'android-icon-background.png'), { transparent: false });
  writeFileSync(join(ASSETS, 'android-icon-background.png'), pngDropAlpha(bgPng));
  await renderSvg(page, svgs['android-icon-monochrome'], 1024, join(ASSETS, 'android-icon-monochrome.png'));
  await renderSvg(page, svgs['splash-icon'], 1024, join(ASSETS, 'splash-icon.png'));
  await renderSvg(page, svgs.favicon, 48, join(ASSETS, 'favicon.png'));

  // Play feature graphic (fonts loaded from node_modules via file:// URLs)
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.goto(pathToFileURL(featurePath).href);
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(() => [document.fonts.check("700 100px 'Unbounded'"), document.fonts.check("600 40px 'Figtree'"), [...document.fonts].map((f) => `${f.family}:${f.status}`)]);
  if (!fontsOk[0] || !fontsOk[1] || fontsOk[2].some((s) => !s.endsWith('loaded'))) throw new Error(`fonts not loaded: ${JSON.stringify(fontsOk)}`);
  const fg = await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 500 } });
  writeFileSync(join(ASSETS, 'store', 'play-feature-graphic.png'), pngDropAlpha(fg));

  if (previewDir) await previews(page, svgs, previewDir);
  await browser.close();
  console.log('rendered icons ->', ASSETS, '\nsources ->', SRC);
}

/** Review sheets: launcher-size renders inside iOS / Android masks, on light & dark wallpapers. */
async function previews(page, svgs, dir) {
  mkdirSync(dir, { recursive: true });
  for (const s of [64, 48]) await renderSvg(page, svgs.icon, s, join(dir, `icon-${s}.png`), { transparent: false });
  const b64 = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const icon = b64(join(ASSETS, 'icon.png'));
  const fgImg = b64(join(ASSETS, 'android-icon-foreground.png'));
  const bgImg = b64(join(ASSETS, 'android-icon-background.png'));
  const mono = b64(join(ASSETS, 'android-icon-monochrome.png'));
  const fav = b64(join(ASSETS, 'favicon.png'));
  const sizes = [180, 120, 64, 48, 29];
  const row = (bg, label) => `<div class="row" style="background:${bg}"><span>${label}</span>
      ${sizes.map((s) => `<img src="${icon}" style="width:${s}px;height:${s}px;border-radius:${s * 0.2237}px">`).join('')}
      ${sizes.slice(0, 4).map((s) => `<div class="ad" style="width:${s}px;height:${s}px"><img src="${bgImg}"><img src="${fgImg}"></div>`).join('')}
      ${sizes.slice(0, 4).map((s) => `<div class="ad th" style="width:${s}px;height:${s}px"><img src="${mono}"></div>`).join('')}
      <img src="${fav}" style="width:48px;height:48px;image-rendering:pixelated"><img src="${fav}" style="width:16px;height:16px"></div>`;
  await page.setViewportSize({ width: 1700, height: 520 });
  await page.setContent(`<!doctype html><html><head><style>
      body{margin:0;font:13px sans-serif} .row{display:flex;align-items:center;gap:18px;padding:16px;height:220px}
      span{width:60px;color:#888} .ad{position:relative;border-radius:50%;overflow:hidden}
      .ad img{position:absolute;width:150%;height:150%;left:-25%;top:-25%} .th{background:#d7e8e4}
      .th img{filter:brightness(0) saturate(100%) invert(19%) sepia(30%) saturate(1500%) hue-rotate(140deg)}
    </style></head><body>${row('#f3f3f3', 'light')}${row('#1c1c1e', 'dark')}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(dir, 'sheet.png'), fullPage: true });
}

export { dial, dialMono, svgDoc, place, petrolBg, iconSvg, G, PINS };
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
