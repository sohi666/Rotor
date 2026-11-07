import { mulberry32 } from '../engine/rng';
import type { Reward } from '../state/store';

/**
 * Safecracker bonus round: a combination dial with SAFE_NUMBERS positions and three
 * tumblers. Turning in the required direction across the right number gives a heavy
 * "catch" (sound + haptic + lamp); letting go on it engages the tumbler.
 *
 * Angle convention: the dial's rotation in radians, positive = clockwise on screen.
 * The number under the top marker is round(-angle / step) mod SAFE_NUMBERS, so turning
 * clockwise counts the numbers down, like a real safe.
 */
export const SAFE_NUMBERS = 40;
export const SAFE_STEP = (Math.PI * 2) / SAFE_NUMBERS;
/** Required direction per tumbler: +1 clockwise (right), -1 counter-clockwise (left). */
export const SAFE_DIRS = [1, -1, 1] as const;

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Shortest distance between two dial numbers. */
export function dialDistance(a: number, b: number): number {
  const d = mod(a - b, SAFE_NUMBERS);
  return Math.min(d, SAFE_NUMBERS - d);
}

/** Three distinct numbers, each well away from the previous stop, so every tumbler needs a real turn. */
export function makeCombo(seed: number): [number, number, number] {
  const rnd = mulberry32(seed * 2654435761);
  const out: number[] = [];
  let prev = 0;
  while (out.length < 3) {
    const n = Math.floor(rnd() * SAFE_NUMBERS);
    if (dialDistance(n, prev) < 9 || out.includes(n)) continue;
    out.push(n);
    prev = n;
  }
  return out as [number, number, number];
}

export type SafeTier = 'gold' | 'silver' | 'bronze';

/** Misses = let-gos that didn't engage a tumbler. */
export function safeTier(misses: number): SafeTier {
  return misses <= 2 ? 'gold' : misses <= 6 ? 'silver' : 'bronze';
}

/** Every third safe also holds a golden key. `cracked` = safes opened before this one. */
export function safeRewards(tier: SafeTier, cracked: number): Reward[] {
  const base: Reward[] =
    tier === 'gold'
      ? [
          { kind: 'coins', n: 150 },
          { kind: 'hint', n: 1 },
          { kind: 'undo', n: 1 },
        ]
      : tier === 'silver'
        ? [
            { kind: 'coins', n: 100 },
            { kind: 'hint', n: 1 },
          ]
        : [
            { kind: 'coins', n: 60 },
            { kind: 'undo', n: 1 },
          ];
  return (cracked + 1) % 3 === 0 ? [...base, { kind: 'goldenKey', n: 1 }] : base;
}
