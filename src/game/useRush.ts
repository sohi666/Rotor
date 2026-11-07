import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyTurn, cellAt, colorOf, ringsToStrings, turnGroup, WILD, type GameState, type LevelDef } from '../engine';
import { RUSH_TURNS, rushPayout, rushRefill, rushStart } from './rush';
import type { Game, Status, UnlockEvent } from './useGame';

export interface RushPay {
  id: number;
  spokes: number;
  coins: number;
}

export interface Rush extends Game {
  haul: number;
  turnsLeft: number;
  pay: RushPay | null;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
/** Cleared pins stay empty this long (the burst plays), then fresh pins drop in. */
export const RUSH_REFILL_MS = 520;

export function useRush(seed: number): Rush {
  const start = useMemo(() => rushStart(seed), [seed]);
  const rnd = useRef(start.rnd);
  const [state, setState] = useState<GameState>(start.state);
  const [offsets, setOffsets] = useState<number[]>(() => new Array(start.state.R).fill(0));
  const [turns, setTurns] = useState(0);
  const [status, setStatus] = useState<Status>('playing');
  const [event, setEvent] = useState<UnlockEvent | null>(null);
  const [haul, setHaul] = useState(0);
  const [pay, setPay] = useState<RushPay | null>(null);
  const eventId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const def = useMemo<LevelDef>(
    () => ({
      id: `rush-${seed}`,
      spokes: start.state.S,
      rings: ringsToStrings(start.state),
      par: 0,
      budget: RUSH_TURNS,
      solution: [],
      difficulty: 1,
    }),
    [seed, start],
  );

  const commit = useCallback(
    (ring: number, signed: number) => {
      if (status !== 'playing' || signed === 0) return;
      const res = applyTurn(state, ring, mod(signed, state.S));
      if (!res) return;
      setOffsets((o) => {
        const next = [...o];
        next[ring] += signed;
        return next;
      });
      const spokes = res.cleared.map((p) => {
        const wild: boolean[] = [];
        let color = -1;
        for (let r = 0; r < state.R; r++) {
          const mv = res.moved.find((m) => m.ring === r);
          const v = cellAt(state, r, p - (mv ? mv.d : 0));
          wild.push(v === WILD);
          if (v !== WILD && color < 0) color = colorOf(v);
        }
        return { p, color, wild };
      });
      const used = turns + 1;
      setTurns(used);
      setState(res.state);
      const last = used >= RUSH_TURNS;
      if (res.cleared.length) {
        const coins = rushPayout(res.cleared.length);
        eventId.current += 1;
        setEvent({ id: eventId.current, spokes, unlocked: [] });
        setHaul((h) => h + coins);
        setPay({ id: eventId.current, spokes: res.cleared.length, coins });
        // A turn made before this fires works on the emptied board; the refill fills whatever is empty then.
        timers.current.push(
          setTimeout(() => {
            setState((cur) => rushRefill(cur, cur.cells, rnd.current));
            if (last) setStatus('won');
          }, RUSH_REFILL_MS),
        );
      } else if (last) {
        timers.current.push(setTimeout(() => setStatus('won'), 250));
      }
    },
    [state, status, turns],
  );

  const groupFor = useCallback(
    (ring: number): [number, number][] | null => {
      if (status !== 'playing') return null;
      return turnGroup(state, ring, 1) ? [[ring, 1]] : null;
    },
    [state, status],
  );

  const noop = useCallback(() => undefined, []);
  return {
    def,
    state,
    offsets,
    turns,
    limit: RUSH_TURNS,
    clears: [],
    status,
    event,
    hint: null,
    canUndo: false,
    groupFor,
    commit,
    undo: noop,
    restart: noop,
    addTurns: noop,
    findHint: () => null,
    clearHint: noop,
    haul,
    turnsLeft: Math.max(0, RUSH_TURNS - turns),
    pay,
  };
}
