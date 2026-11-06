import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTurn,
  cellAt,
  colorOf,
  fromDef,
  isWon,
  mightBeSolvable,
  solve,
  turnGroup,
  type GameState,
  type LevelDef,
  WILD,
} from '../engine';
import { mod } from './geometry';

export type Status = 'playing' | 'won' | 'out' | 'jammed';

/** What the board animates after a turn. */
export interface UnlockEvent {
  id: number;
  /** For each unlocked spoke: its colour and, per ring, whether the pin was wild. */
  spokes: { p: number; color: number; wild: boolean[] }[];
  unlocked: number[];
}

interface Snapshot {
  state: GameState;
  offsets: number[];
  turns: number;
  clears: number[];
}

export interface Hint {
  ring: number;
  /** Signed notches, shortest direction (negative = counter-clockwise). */
  notches: number;
}

export interface Game {
  def: LevelDef;
  state: GameState;
  /** Cumulative notches each ring has visually turned (for rendering). */
  offsets: number[];
  turns: number;
  /** Turn limit including bonus turns, 0 = unlimited. */
  limit: number;
  clears: number[];
  status: Status;
  event: UnlockEvent | null;
  hint: Hint | null;
  canUndo: boolean;
  /** Ring multipliers for a drag on `ring`: [[ring, ±1], ...], or null if it can't turn. */
  groupFor(ring: number): [number, number][] | null;
  commit(ring: number, signedNotches: number): void;
  undo(): void;
  restart(): void;
  addTurns(n: number): void;
  findHint(): Hint | null;
  clearHint(): void;
}

function needsDeepJamCheck(def: LevelDef): boolean {
  return !!(def.links?.length || def.locks?.length || def.rings.some((r) => r.includes('*')));
}

export function useGame(def: LevelDef): Game {
  const start = useMemo(() => fromDef(def), [def]);
  const initial = useMemo<Snapshot>(() => ({ state: start, offsets: new Array(start.R).fill(0), turns: 0, clears: [] }), [start]);
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [bonus, setBonus] = useState(0);
  const [status, setStatus] = useState<Status>('playing');
  const [event, setEvent] = useState<UnlockEvent | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const eventId = useRef(0);
  const jamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSnap(initial);
    setHistory([]);
    setBonus(0);
    setStatus('playing');
    setEvent(null);
    setHint(null);
  }, [initial]);

  useEffect(() => () => {
    if (jamTimer.current) clearTimeout(jamTimer.current);
  }, []);

  const limit = def.budget ? def.budget + bonus : 0;

  const groupFor = useCallback(
    (ring: number): [number, number][] | null => {
      const g = turnGroup(snap.state, ring, 1);
      if (!g) return null;
      return g.map((m) => [m.ring, m.d === 1 ? 1 : -1]);
    },
    [snap.state],
  );

  const scheduleJamCheck = useCallback(
    (s: GameState, turns: number) => {
      if (jamTimer.current) clearTimeout(jamTimer.current);
      if (!mightBeSolvable(s)) {
        setStatus('jammed');
        return;
      }
      if (!needsDeepJamCheck(def)) return;
      // Bounded search after the burst animation; only an exhaustive "no solution" counts as jammed.
      jamTimer.current = setTimeout(() => {
        const res = solve(s, { maxStates: 12_000, maxDepth: 14 });
        if (res.status === 'unsolvable') setStatus((st) => (st === 'playing' ? 'jammed' : st));
      }, 650);
      void turns;
    },
    [def],
  );

  const commit = useCallback(
    (ring: number, signed: number) => {
      if (status !== 'playing' || signed === 0) return;
      const S = snap.state.S;
      const res = applyTurn(snap.state, ring, mod(signed, S));
      if (!res) return;
      const offsets = [...snap.offsets];
      for (const m of turnGroup(snap.state, ring, 1) ?? []) offsets[m.ring] += signed * (m.d === 1 ? 1 : -1);
      // Colours of the pins that burst, read from the board after rotation but before clearing.
      const spokes = res.cleared.map((p) => {
        const wild: boolean[] = [];
        let color = -1;
        for (let r = 0; r < snap.state.R; r++) {
          const moved = res.moved.find((m) => m.ring === r);
          const v = cellAt(snap.state, r, p - (moved ? moved.d : 0));
          wild.push(v === WILD);
          if (v !== WILD && color < 0) color = colorOf(v);
        }
        return { p, color, wild };
      });
      const next: Snapshot = { state: res.state, offsets, turns: snap.turns + 1, clears: [...snap.clears, res.cleared.length] };
      setHistory((h) => [...h, snap]);
      setSnap(next);
      setHint(null);
      if (res.cleared.length || res.unlocked.length) {
        eventId.current += 1;
        setEvent({ id: eventId.current, spokes, unlocked: res.unlocked });
      }
      if (isWon(res.state)) setStatus('won');
      else if (limit && next.turns >= limit) setStatus('out');
      else scheduleJamCheck(res.state, next.turns);
    },
    [snap, status, limit, scheduleJamCheck],
  );

  const undo = useCallback(() => {
    if (!history.length || status === 'won') return;
    if (jamTimer.current) clearTimeout(jamTimer.current);
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setSnap(prev);
    setStatus('playing');
    setHint(null);
  }, [history, status]);

  const restart = useCallback(() => {
    if (jamTimer.current) clearTimeout(jamTimer.current);
    setSnap(initial);
    setHistory([]);
    setStatus('playing');
    setHint(null);
  }, [initial]);

  const addTurns = useCallback(
    (n: number) => {
      setBonus((b) => b + n);
      setStatus((s) => (s === 'out' ? 'playing' : s));
    },
    [],
  );

  const findHint = useCallback((): Hint | null => {
    const S = snap.state.S;
    let move: { ring: number; d: number } | undefined;
    if (snap.turns === 0 && def.solution.length) move = { ring: def.solution[0][0], d: def.solution[0][1] };
    else {
      const res = solve(snap.state, { maxStates: 40_000, maxDepth: 12 });
      if (res.status === 'solved') move = res.path[0];
    }
    if (!move) return null;
    const notches = move.d > S / 2 ? move.d - S : move.d;
    const h = { ring: move.ring, notches };
    setHint(h);
    return h;
  }, [snap, def]);

  return {
    def,
    state: snap.state,
    offsets: snap.offsets,
    turns: snap.turns,
    limit,
    clears: snap.clears,
    status,
    event,
    hint,
    canUndo: history.length > 0 && status !== 'won',
    groupFor,
    commit,
    undo,
    restart,
    addTurns,
    findHint,
    clearHint: () => setHint(null),
  };
}
