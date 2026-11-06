import { Skia, type SkPath } from '@shopify/react-native-skia';

/** Colour-blind symbol for engine colour c, centred at (x, y), sized to a pin of radius r. */
export function symbolPath(c: number, x: number, y: number, r: number): SkPath {
  const p = Skia.PathBuilder.Make();
  const s = r;
  const poly = (pts: [number, number][]) => {
    pts.forEach(([px, py], i) => (i ? p.lineTo(x + px, y + py) : p.moveTo(x + px, y + py)));
    p.close();
  };
  const ring = (n: number, rad: number, rot = -Math.PI / 2): [number, number][] =>
    Array.from({ length: n }, (_, i) => [rad * Math.cos(rot + (i * 2 * Math.PI) / n), rad * Math.sin(rot + (i * 2 * Math.PI) / n)]);
  switch (c) {
    case 0:
      p.addCircle(x, y, s * 0.3);
      break;
    case 1:
      poly(ring(3, s * 0.46));
      break;
    case 2:
      p.addRect(Skia.XYWHRect(x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6));
      break;
    case 3:
      poly(ring(4, s * 0.44));
      break;
    case 4: {
      const w = s * 0.16;
      const l = s * 0.42;
      p.addRect(Skia.XYWHRect(x - l, y - w, l * 2, w * 2));
      p.addRect(Skia.XYWHRect(x - w, y - l, w * 2, l * 2));
      break;
    }
    default: {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 ? s * 0.2 : s * 0.46;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
      }
      poly(pts);
    }
  }
  return p.build();
}

/** A small key: round bow, shaft and two teeth. Stroke it. */
export function keyPath(x: number, y: number, r: number): SkPath {
  const p = Skia.PathBuilder.Make();
  const s = r * 0.5;
  p.addCircle(x - s * 0.55, y, s * 0.42);
  p.moveTo(x - s * 0.13, y);
  p.lineTo(x + s * 0.95, y);
  p.moveTo(x + s * 0.55, y);
  p.lineTo(x + s * 0.55, y + s * 0.38);
  p.moveTo(x + s * 0.85, y);
  p.lineTo(x + s * 0.85, y + s * 0.3);
  return p.build();
}

export function hexPath(x: number, y: number, r: number): SkPath {
  const p = Skia.PathBuilder.Make();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i) p.lineTo(px, py);
    else p.moveTo(px, py);
  }
  p.close();
  return p.build();
}

/** Padlock: shackle arc and body. Returns [shackle (stroke), body (fill)]. */
export function padlockPaths(x: number, y: number, s: number): [SkPath, SkPath] {
  const shackle = Skia.PathBuilder.Make();
  shackle.addArc(Skia.XYWHRect(x - s * 0.32, y - s * 0.62, s * 0.64, s * 0.7), 180, 180);
  shackle.moveTo(x - s * 0.32, y - s * 0.27);
  shackle.lineTo(x - s * 0.32, y - s * 0.05);
  shackle.moveTo(x + s * 0.32, y - s * 0.27);
  shackle.lineTo(x + s * 0.32, y - s * 0.05);
  const body = Skia.PathBuilder.Make();
  body.addRRect(Skia.RRectXY(Skia.XYWHRect(x - s * 0.48, y - s * 0.08, s * 0.96, s * 0.7), s * 0.12, s * 0.12));
  return [shackle.build(), body.build()];
}

/** Small isosceles triangle pointing along angle `dir` (radians). */
export function chevronPath(x: number, y: number, s: number, dir: number): SkPath {
  const p = Skia.PathBuilder.Make();
  const tip = [x + s * Math.cos(dir), y + s * Math.sin(dir)];
  const l = [x + s * 0.7 * Math.cos(dir + 2.4), y + s * 0.7 * Math.sin(dir + 2.4)];
  const r = [x + s * 0.7 * Math.cos(dir - 2.4), y + s * 0.7 * Math.sin(dir - 2.4)];
  p.moveTo(tip[0], tip[1]);
  p.lineTo(l[0], l[1]);
  p.lineTo(r[0], r[1]);
  p.close();
  return p.build();
}

/** Arc arrow along a circle of radius `rad` from angle a0 sweeping `sweep` radians, with a head. */
export function arcArrowPath(cx: number, cy: number, rad: number, a0: number, sweep: number, head: number): SkPath {
  const p = Skia.PathBuilder.Make();
  const rect = Skia.XYWHRect(cx - rad, cy - rad, rad * 2, rad * 2);
  p.addArc(rect, (a0 * 180) / Math.PI, (sweep * 180) / Math.PI);
  const a1 = a0 + sweep;
  const ex = cx + rad * Math.cos(a1);
  const ey = cy + rad * Math.sin(a1);
  const tangent = a1 + (sweep >= 0 ? Math.PI / 2 : -Math.PI / 2);
  p.moveTo(ex + head * Math.cos(tangent + 2.5), ey + head * Math.sin(tangent + 2.5));
  p.lineTo(ex, ey);
  p.lineTo(ex + head * Math.cos(tangent - 2.5), ey + head * Math.sin(tangent - 2.5));
  return p.build();
}
