/** Board layout shared by rendering and the gesture worklets (plain numbers only). */
export interface BoardLayout {
  size: number;
  cx: number;
  cy: number;
  /** Outer brass rim radius. */
  rim: number;
  /** Radius of the central hub. */
  hub: number;
  /** Radial width of one ring band. */
  band: number;
  /** Pin radius (same on every ring). */
  pinR: number;
  /** Angle between spokes (radians). */
  step: number;
  R: number;
  S: number;
}

export function makeLayout(size: number, R: number, S: number): BoardLayout {
  const cx = size / 2;
  const cy = size / 2;
  const rim = size * 0.47;
  const hub = size * (R >= 4 ? 0.1 : 0.12);
  const inner = rim * 0.93;
  const band = (inner - hub) / R;
  const step = (Math.PI * 2) / S;
  const innerMid = hub + band * 0.5;
  const pinR = Math.min(band * 0.36, innerMid * Math.sin(Math.PI / S) * 0.86);
  return { size, cx, cy, rim, hub, band, pinR, step, R, S };
}

export function ringMid(L: BoardLayout, r: number): number {
  return L.hub + L.band * (r + 0.5);
}

/** Angle of spoke/slot index p at rest (spoke 0 points up, increasing clockwise). */
export function slotAngle(L: BoardLayout, p: number): number {
  return -Math.PI / 2 + p * L.step;
}

export function polar(L: BoardLayout, radius: number, angle: number): { x: number; y: number } {
  return { x: L.cx + radius * Math.cos(angle), y: L.cy + radius * Math.sin(angle) };
}

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
