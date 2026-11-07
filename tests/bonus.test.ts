import { describe, expect, it } from 'vitest';
import { SAFE_NUMBERS, dialDistance, makeCombo, safeRewards, safeTier } from '../src/game/safe';
import { RUSH_RINGS, RUSH_SPOKES, rushHasMove, rushPayout, rushRefill, rushStart } from '../src/game/rush';
import { EMPTY, applyTurn, findClears } from '../src/engine';

describe('safecracker', () => {
  it('combinations are distinct, in range and need a real turn each', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const c = makeCombo(seed);
      expect(new Set(c).size).toBe(3);
      let prev = 0;
      for (const n of c) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(SAFE_NUMBERS);
        expect(dialDistance(n, prev)).toBeGreaterThanOrEqual(9);
        prev = n;
      }
    }
    expect(makeCombo(5)).toEqual(makeCombo(5)); // deterministic
  });

  it('tiers by misses, and every third safe adds a golden key', () => {
    expect(safeTier(0)).toBe('gold');
    expect(safeTier(2)).toBe('gold');
    expect(safeTier(3)).toBe('silver');
    expect(safeTier(7)).toBe('bronze');
    expect(safeRewards('gold', 0).some((r) => r.kind === 'goldenKey')).toBe(false);
    expect(safeRewards('bronze', 2).some((r) => r.kind === 'goldenKey')).toBe(true);
  });
});

describe('golden rush', () => {
  it('pays the square of the combo', () => {
    expect([1, 2, 3, 4].map(rushPayout)).toEqual([5, 20, 45, 80]);
  });

  it('never starts with a free match and always has a clearing move', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { state } = rushStart(seed);
      expect(findClears(state.cells, RUSH_RINGS, RUSH_SPOKES)).toEqual([]);
      expect(rushHasMove(state)).toBe(true);
    }
  });

  it('refills cleared spokes without free matches, keeping a move available', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state, rnd } = rushStart(seed);
      // play the first clearing move we can find
      let cleared = null;
      for (let r = 0; r < RUSH_RINGS && !cleared; r++)
        for (let d = 1; d < RUSH_SPOKES && !cleared; d++) {
          const res = applyTurn(state, r, d);
          if (res && res.cleared.length) cleared = res;
        }
      expect(cleared).not.toBeNull();
      const after = cleared!.state;
      expect(Array.from(after.cells).some((v) => v === EMPTY)).toBe(true);
      const refilled = rushRefill(after, after.cells, rnd);
      expect(Array.from(refilled.cells).some((v) => v === EMPTY)).toBe(false);
      expect(findClears(refilled.cells, RUSH_RINGS, RUSH_SPOKES)).toEqual([]);
      expect(rushHasMove(refilled)).toBe(true);
    }
  });
});
