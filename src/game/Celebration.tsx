import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, PaintStyle, Picture, Skia, TileMode, useClock, vec, type SkPaint, type SkRect } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { mulberry32 } from '../engine/rng';
import { C, PIN_COLORS } from '../theme';

/**
 * Level-complete celebration, drawn over the whole game screen (touches pass through).
 *
 *   tier normal  : light rays + shockwave from the hub, confetti in the six pin colours
 *                  bursting out of the dial, coins arcing into the coin counter
 *   tier perfect : + a confetti shower from the top of the screen (3 stars)
 *   tier vault   : + a coin fountain from the dial (every 10th level)
 *
 * Everything is a pure function of time since mount (no per-frame state), redrawn into
 * one SkPicture per frame. The parent unmounts it after `celebrationLength()`.
 * Timings here are mirrored by the sound/haptic schedule in GameScreen.
 */
export type CelebrationTier = 'normal' | 'perfect' | 'vault';

export interface CelebrationSpec {
  id: number;
  tier: CelebrationTier;
  /** Coin sprites that fly to the counter (0-6). */
  coins: number;
  /** Board centre and radius, in this overlay's coordinates. */
  origin: { x: number; y: number; r: number };
  /** Coin counter centre, in this overlay's coordinates. */
  target: { x: number; y: number };
  width: number;
  height: number;
}

export const CELEBRATION = {
  coinsStart: 0.42,
  coinGap: 0.08,
  coinFlight: 0.62,
};

/** Seconds after mount at which coin i lands in the counter. */
export function coinArrival(i: number): number {
  return CELEBRATION.coinsStart + i * CELEBRATION.coinGap + CELEBRATION.coinFlight;
}

export function celebrationLength(tier: CelebrationTier, coins: number): number {
  const coinsEnd = coins > 0 ? coinArrival(coins - 1) + 0.3 : 0;
  const base = tier === 'perfect' ? 3.0 : tier === 'vault' ? 2.8 : 2.1;
  return Math.max(base, coinsEnd);
}

const G = 1500; // px/s², scaled by board size
const DRAG = 1.9;

interface Piece {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  rot: number;
  w: number;
  flip: number;
  fw: number;
  color: number;
  life: number;
  start: number;
  sway: number;
  swayF: number;
  rect: SkRect;
}

interface Coin {
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  start: number;
  spin: number;
}

interface Drop {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  spin: number;
  spinW: number;
  start: number;
}

function hexAlpha(hex: string, a: number) {
  const c = Skia.Color(hex);
  c[3] = a;
  return c;
}

export function Celebration({ spec }: { spec: CelebrationSpec }) {
  const clock = useClock();
  const { tier, origin, target, width, height } = spec;
  const sc = Math.max(0.6, origin.r / 170);

  const art = useMemo(() => {
    const rnd = mulberry32(spec.id * 7919 + 13);
    const r = origin.r;

    // Confetti bursting out of the dial.
    const burst: Piece[] = [];
    const nBurst = tier === 'normal' ? 46 : 64;
    for (let i = 0; i < nBurst; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = (420 + rnd() * 620) * sc;
      const w = (7 + rnd() * 6) * sc;
      const h = w * (0.45 + rnd() * 0.25);
      burst.push({
        x0: origin.x + Math.cos(a) * r * 0.22,
        y0: origin.y + Math.sin(a) * r * 0.22,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 320 * sc,
        rot: rnd() * 360,
        w: (rnd() - 0.5) * 900,
        flip: rnd() * 6.28,
        fw: 6 + rnd() * 10,
        color: i % PIN_COLORS.length,
        life: 1.5 + rnd() * 0.6,
        start: rnd() * 0.06,
        sway: 0,
        swayF: 0,
        rect: Skia.XYWHRect(-w / 2, -h / 2, w, h),
      });
    }

    // 3 stars and vaults: a shower from the top.
    const shower: Piece[] = [];
    if (tier !== 'normal') {
      for (let i = 0; i < 80; i++) {
        const w = (8 + rnd() * 7) * sc;
        const h = w * (0.45 + rnd() * 0.3);
        shower.push({
          x0: rnd() * width,
          y0: -20 - rnd() * height * 0.45,
          vx: 0,
          vy: (230 + rnd() * 190) * sc,
          rot: rnd() * 360,
          w: (rnd() - 0.5) * 500,
          flip: rnd() * 6.28,
          fw: 4 + rnd() * 7,
          color: i % PIN_COLORS.length,
          life: 3.2,
          start: 0.12 + rnd() * 0.25,
          sway: (14 + rnd() * 26) * sc,
          swayF: 1.2 + rnd() * 1.6,
          rect: Skia.XYWHRect(-w / 2, -h / 2, w, h),
        });
      }
    }

    // Coins arcing into the counter.
    const coins: Coin[] = [];
    for (let i = 0; i < spec.coins; i++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
      const sx = origin.x + Math.cos(a) * r * 0.3;
      const sy = origin.y + Math.sin(a) * r * 0.3;
      coins.push({
        sx,
        sy,
        cx: (sx + target.x) / 2 + (rnd() - 0.5) * r * 0.9,
        cy: Math.min(sy, target.y) - r * (0.35 + rnd() * 0.25),
        start: CELEBRATION.coinsStart + i * CELEBRATION.coinGap,
        spin: rnd() * 6.28,
      });
    }

    // Vault: coin fountain.
    const fountain: Drop[] = [];
    if (tier === 'vault') {
      for (let i = 0; i < 28; i++) {
        fountain.push({
          x0: origin.x + (rnd() - 0.5) * r * 0.3,
          y0: origin.y,
          vx: (rnd() - 0.5) * 560 * sc,
          vy: -(820 + rnd() * 520) * sc,
          spin: rnd() * 6.28,
          spinW: 8 + rnd() * 10,
          start: 0.06 + rnd() * 0.35,
        });
      }
    }

    // Light rays: 14 wedges, drawn once around (0,0) and rotated per frame.
    const R = Math.hypot(width, height);
    const pb = Skia.PathBuilder.Make();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + 0.13;
      pb.moveTo(Math.cos(a0) * r * 0.2, Math.sin(a0) * r * 0.2);
      pb.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
      pb.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      pb.lineTo(Math.cos(a1) * r * 0.2, Math.sin(a1) * r * 0.2);
      pb.close();
    }
    const rays = pb.build();

    const paint = (hex: string) => {
      const p = Skia.Paint();
      p.setAntiAlias(true);
      p.setColor(Skia.Color(hex));
      return p;
    };
    const confetti: SkPaint[] = PIN_COLORS.map((c) => paint(c));
    const rayPaint = Skia.Paint();
    rayPaint.setAntiAlias(true);
    rayPaint.setShader(
      Skia.Shader.MakeRadialGradient(vec(0, 0), r * 2.6, [hexAlpha(C.brassLight, 0.55), hexAlpha(C.brassLight, 0)], null, TileMode.Clamp),
    );
    const glow = Skia.Paint();
    glow.setAntiAlias(true);
    glow.setShader(Skia.Shader.MakeRadialGradient(vec(0, 0), r * 0.75, [hexAlpha('#FFF4D6', 0.9), hexAlpha(C.brassLight, 0)], null, TileMode.Clamp));
    const wave = paint(C.brassLight);
    wave.setStyle(PaintStyle.Stroke);
    const coinRim = paint(C.brassDeep);
    const coinFace = paint(C.brass);
    const coinShine = paint('#FFF1C9');
    const spark = paint('#FFF1C9');
    spark.setStyle(PaintStyle.Stroke);

    return {
      burst,
      shower,
      coins,
      fountain,
      rays,
      confetti,
      rayPaint,
      glow,
      wave,
      coinRim,
      coinFace,
      coinShine,
      spark,
    };
  }, [spec.id, spec.coins, tier, origin.x, origin.y, origin.r, target.x, target.y, width, height, sc]);

  const picture = useDerivedValue(() => {
    const t = clock.value / 1000;
    const a = art;
    const rec = Skia.PictureRecorder();
    const cv = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const ox = origin.x;
    const oy = origin.y;
    const r = origin.r;

    const fade = (x: number, inEnd: number, outStart: number, outEnd: number) =>
      x <= 0 ? 0 : x < inEnd ? x / inEnd : x < outStart ? 1 : x < outEnd ? 1 - (x - outStart) / (outEnd - outStart) : 0;

    // Rays, slowly turning.
    const ra = fade(t, 0.18, tier === 'normal' ? 0.9 : 1.3, tier === 'normal' ? 1.6 : 2.2);
    if (ra > 0) {
      a.rayPaint.setAlphaf(ra * 0.75);
      cv.save();
      cv.translate(ox, oy);
      cv.rotate(t * 14, 0, 0);
      cv.drawPath(a.rays, a.rayPaint);
      cv.restore();
    }

    // Hub glow and one shockwave ring.
    const ga = fade(t, 0.08, 0.25, 0.8);
    if (ga > 0) {
      a.glow.setAlphaf(ga);
      cv.save();
      cv.translate(ox, oy);
      cv.drawCircle(0, 0, r * 0.75, a.glow);
      cv.restore();
    }
    if (t < 0.6) {
      const p = t / 0.6;
      const e = 1 - (1 - p) * (1 - p) * (1 - p);
      a.wave.setStrokeWidth(Math.max(0.5, 7 * sc * (1 - p)));
      a.wave.setAlphaf(0.7 * (1 - p));
      cv.drawCircle(ox, oy, r * (0.28 + 0.9 * e), a.wave);
    }

    // Confetti burst (with air drag) and shower.
    for (let i = 0; i < a.burst.length; i++) {
      const q = a.burst[i];
      const tl = t - q.start;
      if (tl <= 0 || tl > q.life) continue;
      const ex = (1 - Math.exp(-DRAG * tl)) / DRAG;
      const g = G * sc;
      const x = q.x0 + q.vx * ex;
      const y = q.y0 + (q.vy + g / DRAG) * ex - (g * tl) / DRAG;
      const al = tl > q.life - 0.45 ? (q.life - tl) / 0.45 : 1;
      const paint = a.confetti[q.color];
      paint.setAlphaf(al);
      cv.save();
      cv.translate(x, y);
      cv.rotate(q.rot + q.w * tl, 0, 0);
      cv.scale(1, Math.max(0.12, Math.abs(Math.cos(q.flip + q.fw * tl))));
      cv.drawRect(q.rect, paint);
      cv.restore();
    }
    for (let i = 0; i < a.shower.length; i++) {
      const q = a.shower[i];
      const tl = t - q.start;
      if (tl <= 0) continue;
      const y = q.y0 + q.vy * tl;
      if (y > height + 30) continue;
      const x = q.x0 + q.sway * Math.sin(q.swayF * tl * 6.28 + q.flip);
      const al = t > q.life - 0.4 ? Math.max(0, (q.life - t) / 0.4) : 1;
      if (al <= 0) continue;
      const paint = a.confetti[q.color];
      paint.setAlphaf(al);
      cv.save();
      cv.translate(x, y);
      cv.rotate(q.rot + q.w * tl, 0, 0);
      cv.scale(1, Math.max(0.12, Math.abs(Math.cos(q.flip + q.fw * tl))));
      cv.drawRect(q.rect, paint);
      cv.restore();
    }

    const coinR = 10 * sc;
    const drawCoin = (x: number, y: number, s: number, spin: number) => {
      cv.save();
      cv.translate(x, y);
      cv.scale(Math.max(0.18, Math.abs(Math.cos(spin))) * s, s);
      cv.drawCircle(0, 0, coinR, a.coinRim);
      cv.drawCircle(0, 0, coinR * 0.8, a.coinFace);
      cv.drawCircle(-coinR * 0.28, -coinR * 0.3, coinR * 0.26, a.coinShine);
      cv.restore();
    };

    // Vault fountain.
    for (let i = 0; i < a.fountain.length; i++) {
      const d = a.fountain[i];
      const tl = t - d.start;
      if (tl <= 0) continue;
      const g = G * 1.1 * sc;
      const y = d.y0 + d.vy * tl + 0.5 * g * tl * tl;
      if (y > height + 30) continue;
      drawCoin(d.x0 + d.vx * tl, y, 1.1, d.spin + d.spinW * tl);
    }

    // Coins flying to the counter, with a small spark where each lands.
    for (let i = 0; i < a.coins.length; i++) {
      const c = a.coins[i];
      const u = (t - c.start) / CELEBRATION.coinFlight;
      if (u < -0.18) continue;
      if (u < 0) {
        // pops out of the dial just before it flies
        drawCoin(c.sx, c.sy, (u + 0.18) / 0.18, c.spin);
        continue;
      }
      if (u <= 1) {
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const m = 1 - e;
        const x = m * m * c.sx + 2 * m * e * c.cx + e * e * target.x;
        const y = m * m * c.sy + 2 * m * e * c.cy + e * e * target.y;
        drawCoin(x, y, 1 - 0.35 * e, c.spin + u * 14);
      } else if (u < 1 + 0.4) {
        const p = (u - 1) / 0.4;
        a.spark.setStrokeWidth(2 * sc * (1 - p) + 0.5);
        a.spark.setAlphaf(1 - p);
        cv.drawCircle(target.x, target.y, coinR * (0.8 + 1.4 * p), a.spark);
      }
    }

    return rec.finishRecordingAsPicture();
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
