import { applyTurn, canonicalKey, findClears, isWon, turnGroup } from './board';
import { type GameState, type Move } from './types';
import type { Rng } from './rng';

export interface SolveResult {
  /** 'solved' with an optimal path, 'unsolvable' when the search space was exhausted, 'cap' when it hit the state limit. */
  status: 'solved' | 'unsolvable' | 'cap';
  par: number;
  path: Move[];
  /** Number of distinct first turns that start an optimal solution. */
  optimalFirstMoves: number;
  /** Total distinct first turns available. */
  firstMoves: number;
  statesExplored: number;
}

interface Node {
  state: GameState;
  depth: number;
  parent: string | null;
  move: Move | null;
  /** Bitmask of first-move indices that reach this node on a shortest path. */
  mask: number;
}

/** Rings the player can turn right now (not locked, not jammed by a locked follower). */
export function turnableRings(state: GameState): number[] {
  const out: number[] = [];
  for (let r = 0; r < state.R; r++) if (turnGroup(state, r, 1)) out.push(r);
  return out;
}

export function legalMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  for (const ring of turnableRings(state)) {
    for (let d = 1; d < state.S; d++) moves.push({ ring, d });
  }
  return moves;
}

/**
 * Layered BFS for the minimum number of turns to clear the board.
 * `maxStates` bounds memory/time; `maxDepth` bounds the search depth.
 */
export function solve(start: GameState, opts: { maxStates?: number; maxDepth?: number } = {}): SolveResult {
  const maxStates = opts.maxStates ?? 400_000;
  const maxDepth = opts.maxDepth ?? 40;
  const startKey = canonicalKey(start);
  const nodes = new Map<string, Node>();
  nodes.set(startKey, { state: start, depth: 0, parent: null, move: null, mask: 0 });
  const firstMoves = legalMoves(start);
  const result = (status: SolveResult['status'], par = 0, path: Move[] = [], opt = 0): SolveResult => ({
    status,
    par,
    path,
    optimalFirstMoves: opt,
    firstMoves: firstMoves.length,
    statesExplored: nodes.size,
  });
  if (isWon(start)) return result('solved');

  let layer: string[] = [startKey];
  for (let depth = 0; depth < maxDepth && layer.length; depth++) {
    const next: string[] = [];
    const goals: string[] = [];
    for (const key of layer) {
      const node = nodes.get(key)!;
      const moves = depth === 0 ? firstMoves : legalMoves(node.state);
      for (let i = 0; i < moves.length; i++) {
        const mv = moves[i];
        const res = applyTurn(node.state, mv.ring, mv.d);
        if (!res) continue;
        const childKey = canonicalKey(res.state);
        const mask = depth === 0 ? (i < 31 ? 1 << i : 0) : node.mask;
        const existing = nodes.get(childKey);
        if (existing) {
          if (existing.depth === depth + 1) existing.mask |= mask;
          continue;
        }
        nodes.set(childKey, { state: res.state, depth: depth + 1, parent: key, move: mv, mask });
        if (isWon(res.state)) goals.push(childKey);
        else next.push(childKey);
        if (nodes.size > maxStates) return result('cap');
      }
    }
    if (goals.length) {
      let opt = 0;
      for (const g of goals) opt |= nodes.get(g)!.mask;
      return result('solved', depth + 1, reconstruct(nodes, goals[0]), popcount(opt));
    }
    layer = next;
  }
  return result(layer.length ? 'cap' : 'unsolvable');
}

function reconstruct(nodes: Map<string, Node>, goal: string): Move[] {
  const path: Move[] = [];
  let k: string | null = goal;
  while (k) {
    const n: Node = nodes.get(k)!;
    if (n.move) path.push(n.move);
    k = n.parent;
  }
  return path.reverse();
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** Spokes where all rings but one already agree — a rough "almost there" signal. */
function nearMisses(state: GameState): number {
  const { R, S, cells } = state;
  let n = 0;
  for (let p = 0; p < S; p++) {
    const seen = new Map<number, number>();
    for (let r = 0; r < R; r++) {
      const v = cells[r * S + p];
      if (v >= 3) seen.set(v >= 9 ? v - 6 : v, (seen.get(v >= 9 ? v - 6 : v) ?? 0) + 1);
    }
    for (const c of seen.values()) if (c === R - 1) n++;
  }
  return n;
}

/**
 * A naive "grab the biggest clear now" player. The gap between its turn count
 * and par is a good proxy for how much planning a level demands.
 */
export function greedyTurns(start: GameState, rng: Rng, cap = 40): number {
  let state = start;
  for (let t = 1; t <= cap; t++) {
    let best: { score: number; s: GameState }[] = [];
    let bestScore = -1;
    for (const mv of legalMoves(state)) {
      const res = applyTurn(state, mv.ring, mv.d);
      if (!res) continue;
      const score = res.cleared.length * 100 + nearMisses(res.state);
      if (score > bestScore) {
        bestScore = score;
        best = [{ score, s: res.state }];
      } else if (score === bestScore) best.push({ score, s: res.state });
    }
    if (!best.length) return cap + 1;
    state = best[Math.floor(rng() * best.length)].s;
    if (isWon(state)) return t;
  }
  return cap + 1;
}

/** Immediate clears available from a state (used by hints to explain a move). */
export function clearsAfter(state: GameState, mv: Move): number {
  const res = applyTurn(state, mv.ring, mv.d);
  return res ? res.cleared.length : 0;
}

export { findClears };
