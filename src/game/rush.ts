import { COLOR_BASE, EMPTY, findClears, type GameState } from '../engine';
import { mulberry32 } from '../engine/rng';

/**
 * Golden Rush bonus round: a 3-ring, 8-spoke dial filled with three colours, ten turns.
 * Every cleared spoke pays coins (combos pay the square: 5, 20, 45, 80...) and refills
 * straight away, so the board never runs dry. There is no way to lose.
 */
export const RUSH_TURNS = 10;
export const RUSH_RINGS = 3;
export const RUSH_SPOKES = 8;
export const RUSH_COLORS = 3;

export function rushPayout(spokes: number): number {
  return 5 * spokes * spokes;
}

export type Rng = () => number;
export const rushRng = (seed: number): Rng => mulberry32(seed * 40503 + 7);

function spokeMatches(cells: Int8Array, p: number): boolean {
  return findClears(cells, RUSH_RINGS, RUSH_SPOKES).includes(p);
}

/** Fill every empty cell, re-rolling any spoke that would match on its own (matches must be earned). */
export function rushFill(cells: Int8Array, rnd: Rng): Int8Array {
  const out = new Int8Array(cells);
  for (let p = 0; p < RUSH_SPOKES; p++) {
    const empties: number[] = [];
    for (let r = 0; r < RUSH_RINGS; r++) if (out[r * RUSH_SPOKES + p] === EMPTY) empties.push(r * RUSH_SPOKES + p);
    if (!empties.length) continue;
    for (let tries = 0; tries < 30; tries++) {
      for (const i of empties) out[i] = COLOR_BASE + Math.floor(rnd() * RUSH_COLORS);
      if (!spokeMatches(out, p)) break;
    }
  }
  return out;
}

export function rushStart(seed: number): { state: GameState; rnd: Rng } {
  const rnd = rushRng(seed);
  const empty = new Int8Array(RUSH_RINGS * RUSH_SPOKES).fill(EMPTY);
  const state = rushRefill({ R: RUSH_RINGS, S: RUSH_SPOKES, cells: empty, locked: 0, lockOrder: [], links: [] }, empty, rnd);
  return { state, rnd };
}

/**
 * Refill the empty cells of `state` (`before` = cells to keep as they are), guaranteeing at
 * least one clearing move: re-roll the new pins, and as a last resort re-roll one whole spoke.
 */
export function rushRefill(state: GameState, before: Int8Array, rnd: Rng): GameState {
  for (let tries = 0; tries < 40; tries++) {
    const cells = rushFill(before, rnd);
    const next = { ...state, cells };
    if (rushHasMove(next)) return next;
    if (tries > 20) {
      const p = Math.floor(rnd() * RUSH_SPOKES);
      before = new Int8Array(before);
      for (let r = 0; r < RUSH_RINGS; r++) before[r * RUSH_SPOKES + p] = EMPTY;
    }
  }
  return { ...state, cells: rushFill(before, rnd) };
}

/** True when some single turn of some ring clears at least one spoke. */
export function rushHasMove(state: GameState): boolean {
  const { R, S, cells } = state;
  for (let r = 0; r < R; r++) {
    for (let d = 1; d < S; d++) {
      const c = new Int8Array(cells);
      for (let p = 0; p < S; p++) c[r * S + ((p + d) % S)] = cells[r * S + p];
      if (findClears(c, R, S).length) return true;
    }
  }
  return false;
}
