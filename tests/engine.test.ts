import { describe, expect, it } from 'vitest';
import { applyTurn, canonicalKey, canTurn, fromDef, findClears, isWon, mightBeSolvable, ringsToStrings, solve } from '../src/engine';
import { generate } from '../src/engine/generator';
import levels from '../src/data/levels.json';
import type { LevelDef } from '../src/engine/types';

const L = levels as LevelDef[];

describe('rules', () => {
  it('rotates a ring clockwise by d notches', () => {
    const s = fromDef({ spokes: 6, rings: ['abcdef', '......'] });
    const r = applyTurn(s, 0, 2)!;
    expect(ringsToStrings(r.state)[0]).toBe('efabcd');
  });

  it('unlocks every aligned spoke at once and empties it', () => {
    const s = fromDef({ spokes: 6, rings: ['a.a.a.', '.a.a.a'] });
    const r = applyTurn(s, 1, 1)!;
    expect(r.cleared.sort()).toEqual([0, 2, 4]);
    expect(isWon(r.state)).toBe(true);
  });

  it('wild pins match any colour but an all-wild spoke does not unlock', () => {
    const s = fromDef({ spokes: 3, rings: ['a*.', '**.'] });
    expect(findClears(s.cells, s.R, s.S)).toEqual([0]);
  });

  it('bolts and empty slots block a spoke', () => {
    const s = fromDef({ spokes: 3, rings: ['a#b', 'aab', '.ab'] });
    expect(findClears(s.cells, s.R, s.S)).toEqual([2]);
  });

  it('gears: driver turns its follower, follower turns alone', () => {
    const s = fromDef({ spokes: 4, rings: ['ab..', 'ab..'], links: [[0, 1, -1]] });
    const driven = applyTurn(s, 0, 1)!;
    expect(driven.moved).toEqual([
      { ring: 0, d: 1 },
      { ring: 1, d: 3 },
    ]);
    const alone = applyTurn(s, 1, 1)!;
    expect(alone.moved).toEqual([{ ring: 1, d: 1 }]);
  });

  it('locked rings cannot turn until a key is cleared, and jam their drivers', () => {
    const s = fromDef({ spokes: 4, rings: ['A...', 'a...', 'b..b'], locks: [2], links: [[1, 2, 1]] });
    expect(canTurn(s, 2)).toBe(false);
    expect(canTurn(s, 1)).toBe(false); // ring 1 drives the locked ring 2
    expect(canTurn(s, 0)).toBe(true);
    expect(applyTurn(s, 2, 1)).toBeNull();
  });

  it('a cleared key unlocks the next locked ring', () => {
    const s = fromDef({ spokes: 4, rings: ['.A..', 'a...', 'ab.b'], locks: [2] });
    const r = applyTurn(s, 0, 3)!;
    expect(r.cleared).toEqual([0]);
    expect(r.unlocked).toEqual([2]);
    expect(canTurn(r.state, 2)).toBe(true);
  });

  it('canonical key ignores rotating the whole board', () => {
    const a = fromDef({ spokes: 4, rings: ['ab..', '.ab.'] });
    const b = fromDef({ spokes: 4, rings: ['.ab.', '..ab'] });
    expect(canonicalKey(a)).toBe(canonicalKey(b));
  });

  it('detects jammed boards', () => {
    expect(mightBeSolvable(fromDef({ spokes: 4, rings: ['ab..', 'a...'] }))).toBe(false);
    expect(mightBeSolvable(fromDef({ spokes: 4, rings: ['ab..', 'aa..'] }))).toBe(false);
    expect(mightBeSolvable(fromDef({ spokes: 4, rings: ['ab..', 'a*..'] }))).toBe(true);
  });
});

describe('solver', () => {
  it('finds the one-turn triple unlock', () => {
    const r = solve(fromDef({ spokes: 6, rings: ['a.a.a.', '.a.a.a'] }));
    expect(r.status).toBe('solved');
    expect(r.par).toBe(1);
  });

  it('reports unsolvable boards', () => {
    const r = solve(fromDef({ spokes: 4, rings: ['ab..', 'a...'] }), { maxDepth: 6 });
    expect(r.status).not.toBe('solved');
  });

  it('generator is deterministic for a seed', () => {
    const spec = { rings: 3, spokes: 6, colors: 3, pins: 6, par: [2, 4] as [number, number] };
    expect(generate(spec, 42).def).toEqual(generate(spec, 42).def);
  });
});

describe('campaign data', () => {
  it('has 200 levels with unique ids', () => {
    expect(L).toHaveLength(200);
    expect(new Set(L.map((l) => l.id)).size).toBe(200);
  });

  it('every stored solution clears its board in exactly par turns', () => {
    for (const lv of L) {
      let s = fromDef(lv);
      expect(findClears(s.cells, s.R, s.S), lv.id).toEqual([]);
      for (const [ring, d] of lv.solution) {
        const r = applyTurn(s, ring, d);
        expect(r, `${lv.id} illegal move`).not.toBeNull();
        s = r!.state;
      }
      expect(isWon(s), lv.id).toBe(true);
      expect(lv.solution.length, lv.id).toBe(lv.par);
      if (lv.budget) expect(lv.budget, lv.id).toBeGreaterThanOrEqual(lv.par + 2);
    }
  });

  it('levels 1-35 have no turn limit', () => {
    expect(L.slice(0, 35).every((l) => l.budget === 0)).toBe(true);
    expect(L.slice(35).every((l) => l.budget > 0)).toBe(true);
  });
});
