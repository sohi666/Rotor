import { fromDef, findClears, ringsToStrings } from './board';
import { greedyTurns, solve } from './solver';
import { mulberry32, randInt, shuffle, type Rng } from './rng';
import { type LevelDef, type Link, type Twist } from './types';

export interface GenSpec {
  rings: number;
  spokes: number;
  colors: number;
  /** Pins per ring. */
  pins: number;
  /** How many rings get one bolt each. */
  bolts?: number;
  link?: 'same' | 'counter';
  wilds?: number;
  lock?: boolean;
  /** Accept only levels whose optimal turn count is in this range. */
  par: [number, number];
  /** Minimum (greedy turns − par): forces levels that reward planning. */
  minGap?: number;
  maxStates?: number;
}

export interface Candidate {
  def: Omit<LevelDef, 'id' | 'budget' | 'intro'>;
  greedy: number;
}

const LETTERS = 'abcdef';

function buildRings(spec: GenSpec, rng: Rng): { rings: string[]; links: Link[]; locks: number[] } {
  const { rings: R, spokes: S, colors: C, pins: P } = spec;
  // Same colour multiset on every ring, so the board starts fully clearable.
  const multiset: string[] = [];
  for (let i = 0; i < P; i++) multiset.push(LETTERS[i % C]);
  const boltRings = new Set(shuffle(rng, [...Array(R).keys()]).slice(0, spec.bolts ?? 0));
  const grid: string[][] = [];
  for (let r = 0; r < R; r++) {
    const slots = [...multiset];
    if (boltRings.has(r)) slots.push('#');
    while (slots.length < S) slots.push('.');
    grid.push(shuffle(rng, slots));
  }
  // Wilds replace a pin on distinct rings.
  const wildRings = shuffle(rng, [...Array(R).keys()]).slice(0, spec.wilds ?? 0);
  for (const r of wildRings) {
    const pinIdx = grid[r].map((ch, i) => (LETTERS.includes(ch) ? i : -1)).filter((i) => i >= 0);
    grid[r][pinIdx[randInt(rng, 0, pinIdx.length - 1)]] = '*';
  }
  const links: Link[] = [];
  if (spec.link) {
    const a = randInt(rng, 0, R - 2);
    links.push([a, a + 1, spec.link === 'same' ? 1 : -1]);
  }
  const locks: number[] = [];
  if (spec.lock) {
    const lockedRing = randInt(rng, 0, R - 1);
    locks.push(lockedRing);
    const others = [...Array(R).keys()].filter((r) => r !== lockedRing);
    const keyRing = others[randInt(rng, 0, others.length - 1)];
    const pinIdx = grid[keyRing].map((ch, i) => (LETTERS.includes(ch) ? i : -1)).filter((i) => i >= 0);
    const i = pinIdx[randInt(rng, 0, pinIdx.length - 1)];
    grid[keyRing][i] = grid[keyRing][i].toUpperCase();
  }
  return { rings: grid.map((g) => g.join('')), links, locks };
}

/** Difficulty proxy: optimal length, how much planning beats greed, and how few openings work. */
export function difficultyScore(par: number, greedy: number, optFirst: number, firstMoves: number, R: number): number {
  const gap = Math.min(6, Math.max(0, greedy - par)); // a greedy player that jams counts as "much harder", not infinitely
  const narrow = firstMoves ? 1 - optFirst / firstMoves : 0;
  return Math.round((par * 1.0 + gap * 0.8 + narrow * 2 + (R - 2) * 0.5) * 100) / 100;
}

/** Try one random board; returns a solver-verified candidate or null. */
export function tryGenerate(spec: GenSpec, rng: Rng): Candidate | null {
  const { rings, links, locks } = buildRings(spec, rng);
  const state = fromDef({ spokes: spec.spokes, rings, links, locks });
  if (findClears(state.cells, state.R, state.S).length) return null; // no free clears at start
  const res = solve(state, { maxStates: spec.maxStates ?? 250_000, maxDepth: spec.par[1] });
  if (res.status !== 'solved' || res.par < spec.par[0] || res.par > spec.par[1]) return null;
  let greedy = 0;
  for (let i = 0; i < 3; i++) greedy += greedyTurns(state, rng);
  greedy = Math.round(greedy / 3);
  if (spec.minGap && greedy - res.par < spec.minGap) return null;
  return {
    def: {
      spokes: spec.spokes,
      rings: ringsToStrings(state),
      ...(links.length ? { links } : {}),
      ...(locks.length ? { locks } : {}),
      par: res.par,
      solution: res.path.map((m) => [m.ring, m.d] as [number, number]),
      difficulty: difficultyScore(res.par, greedy, res.optimalFirstMoves, res.firstMoves, spec.rings),
    },
    greedy,
  };
}

export function generate(spec: GenSpec, seed: number, attempts = 400, relax = 0): Candidate {
  const rng = mulberry32(seed);
  for (let i = 0; i < attempts; i++) {
    const c = tryGenerate(spec, rng);
    if (c) return c;
  }
  if (relax >= 4) throw new Error(`Could not generate a level for ${JSON.stringify(spec)}`);
  // Relax the planning requirement first, then widen the par range, rather than fail.
  if (spec.minGap) return generate({ ...spec, minGap: undefined }, seed + 1, attempts, relax + 1);
  return generate({ ...spec, par: [Math.max(1, spec.par[0] - 1), spec.par[1] + 1] }, seed + 2, attempts, relax + 1);
}

export function twistsOf(spec: GenSpec): Twist[] {
  const t: Twist[] = [];
  if (spec.bolts) t.push('bolt');
  if (spec.link === 'same') t.push('link');
  if (spec.link === 'counter') t.push('counter');
  if (spec.wilds) t.push('wild');
  if (spec.lock) t.push('lock');
  return t;
}
