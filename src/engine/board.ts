import {
  BOLT,
  COLOR_BASE,
  EMPTY,
  KEY_BASE,
  type GameState,
  type LevelDef,
  type Link,
  type Move,
  type TurnResult,
  WILD,
} from './types';

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

/** Colour index 0..5 of a coloured or keyed pin, -1 otherwise. */
export function colorOf(v: number): number {
  if (v >= KEY_BASE) return v - KEY_BASE;
  if (v >= COLOR_BASE) return v - COLOR_BASE;
  return -1;
}

export function isPin(v: number): boolean {
  return v === WILD || v >= COLOR_BASE;
}

export function isKey(v: number): boolean {
  return v >= KEY_BASE;
}

const CHAR_TO_CELL: Record<string, number> = { '.': EMPTY, '#': BOLT, '*': WILD };

export function charToCell(ch: string): number {
  if (ch in CHAR_TO_CELL) return CHAR_TO_CELL[ch];
  const lower = ch.charCodeAt(0) - 97; // 'a'
  if (lower >= 0 && lower < 6) return COLOR_BASE + lower;
  const upper = ch.charCodeAt(0) - 65; // 'A'
  if (upper >= 0 && upper < 6) return KEY_BASE + upper;
  throw new Error(`Bad cell char "${ch}"`);
}

export function cellToChar(v: number): string {
  if (v === EMPTY) return '.';
  if (v === BOLT) return '#';
  if (v === WILD) return '*';
  if (v >= KEY_BASE) return String.fromCharCode(65 + v - KEY_BASE);
  return String.fromCharCode(97 + v - COLOR_BASE);
}

// ---------------------------------------------------------------------------
// Construction / serialization
// ---------------------------------------------------------------------------

export function fromDef(def: Pick<LevelDef, 'spokes' | 'rings' | 'links' | 'locks'>): GameState {
  const R = def.rings.length;
  const S = def.spokes;
  const cells = new Int8Array(R * S);
  def.rings.forEach((ring, r) => {
    if (ring.length !== S) throw new Error(`Ring ${r} has ${ring.length} slots, expected ${S}`);
    for (let p = 0; p < S; p++) cells[r * S + p] = charToCell(ring[p]);
  });
  const lockOrder = def.locks ?? [];
  let locked = 0;
  for (const r of lockOrder) locked |= 1 << r;
  return { R, S, cells, locked, lockOrder, links: def.links ?? [] };
}

export function ringsToStrings(state: GameState): string[] {
  const out: string[] = [];
  for (let r = 0; r < state.R; r++) {
    let s = '';
    for (let p = 0; p < state.S; p++) s += cellToChar(state.cells[r * state.S + p]);
    out.push(s);
  }
  return out;
}

export function cellAt(state: GameState, ring: number, spoke: number): number {
  return state.cells[ring * state.S + (((spoke % state.S) + state.S) % state.S)];
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Rings that move when `ring` is turned by `d`, with their own notch offsets,
 * following gear chains driver → follower. Returns null if any ring in the
 * group is locked (a locked follower jams its driver too).
 */
export function turnGroup(state: GameState, ring: number, d: number): Move[] | null {
  const S = state.S;
  const mult = new Map<number, number>([[ring, 1]]);
  const queue = [ring];
  while (queue.length) {
    const r = queue.shift()!;
    const m = mult.get(r)!;
    for (const [driver, follower, dir] of state.links) {
      if (driver !== r || mult.has(follower)) continue;
      mult.set(follower, m * dir);
      queue.push(follower);
    }
  }
  const moves: Move[] = [];
  for (const [r, m] of mult) {
    if (state.locked & (1 << r)) return null;
    moves.push({ ring: r, d: (((d * m) % S) + S) % S });
  }
  return moves;
}

export function canTurn(state: GameState, ring: number): boolean {
  return turnGroup(state, ring, 1) !== null;
}

/** Spokes whose pins would unlock in the given cells. */
export function findClears(cells: Int8Array, R: number, S: number): number[] {
  const out: number[] = [];
  for (let p = 0; p < S; p++) {
    let color = -1;
    let ok = true;
    for (let r = 0; r < R; r++) {
      const v = cells[r * S + p];
      if (v === EMPTY || v === BOLT) {
        ok = false;
        break;
      }
      if (v === WILD) continue;
      const c = colorOf(v);
      if (color === -1) color = c;
      else if (c !== color) {
        ok = false;
        break;
      }
    }
    if (ok && color !== -1) out.push(p);
  }
  return out;
}

/** Apply a turn. Returns null if the ring (or a ring linked to it) is locked. */
export function applyTurn(state: GameState, ring: number, d: number): TurnResult | null {
  const { R, S } = state;
  const moved = turnGroup(state, ring, d);
  if (!moved) return null;
  const cells = new Int8Array(state.cells);
  for (const m of moved) {
    if (m.d === 0) continue;
    const base = m.ring * S;
    for (let p = 0; p < S; p++) cells[base + ((p + m.d) % S)] = state.cells[base + p];
  }
  const cleared = findClears(cells, R, S);
  let keys = 0;
  for (const p of cleared) {
    for (let r = 0; r < R; r++) {
      const i = r * S + p;
      if (isKey(cells[i])) keys++;
      cells[i] = EMPTY;
    }
  }
  let locked = state.locked;
  const unlocked: number[] = [];
  for (const r of state.lockOrder) {
    if (keys === 0) break;
    if (locked & (1 << r)) {
      locked &= ~(1 << r);
      unlocked.push(r);
      keys--;
    }
  }
  return {
    state: { R, S, cells, locked, lockOrder: state.lockOrder, links: state.links },
    moved,
    cleared,
    unlocked,
  };
}

export function pinsLeft(state: GameState): number {
  let n = 0;
  for (let i = 0; i < state.cells.length; i++) if (isPin(state.cells[i])) n++;
  return n;
}

export function isWon(state: GameState): boolean {
  return pinsLeft(state) === 0;
}

/**
 * Cheap necessary condition for solvability. Every unlock removes exactly one
 * pin from every ring, so all rings need equal pin counts, and each colour must
 * be coverable in every ring by that colour or wilds. `false` means jammed.
 */
export function mightBeSolvable(state: GameState): boolean {
  const { R, S, cells } = state;
  const counts: number[][] = [];
  const wilds: number[] = [];
  let total = -1;
  for (let r = 0; r < R; r++) {
    const c = [0, 0, 0, 0, 0, 0];
    let w = 0;
    let n = 0;
    for (let p = 0; p < S; p++) {
      const v = cells[r * S + p];
      if (v === WILD) {
        w++;
        n++;
      } else if (v >= COLOR_BASE) {
        c[colorOf(v)]++;
        n++;
      }
    }
    if (total === -1) total = n;
    else if (n !== total) return false;
    counts.push(c);
    wilds.push(w);
  }
  for (let col = 0; col < 6; col++) {
    let need = 0;
    for (let r = 0; r < R; r++) need = Math.max(need, counts[r][col]);
    if (need === 0) continue;
    for (let r = 0; r < R; r++) if (counts[r][col] + wilds[r] < need) return false;
  }
  return true;
}

/** Canonical key, invariant under rotating the whole board (all rings together). */
export function canonicalKey(state: GameState): string {
  const { R, S, cells } = state;
  // Each ring doubled, so every global rotation g is a substring at offset g.
  const doubled: string[] = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (let p = 0; p < S; p++) s += KEY_CHARS[cells[r * S + p]];
    doubled.push(s + s);
  }
  let best = '';
  for (let g = 0; g < S; g++) {
    let k = '';
    for (let r = 0; r < R; r++) k += doubled[r].substr(g, S);
    if (g === 0 || k < best) best = k;
  }
  return state.locked ? best + state.locked : best;
}

const KEY_CHARS = 'ABCDEFGHIJKLMNOP';

export function linksOf(state: GameState, ring: number): Link[] {
  return state.links.filter(([driver, follower]) => driver === ring || follower === ring);
}
