import { useSyncExternalStore } from 'react';
import { kv } from './kv';
import type { Lang } from '../i18n';

export interface DailyResult {
  turns: number;
  par: number;
  won: boolean;
  /** Spokes unlocked on each turn, for the spoiler-free share card. */
  clears: number[];
}

export interface Progress {
  version: 1;
  /** Highest campaign level the player may open (1-based). */
  unlocked: number;
  stars: Record<string, number>;
  bestTurns: Record<string, number>;
  coins: number;
  boosters: { undo: number; hint: number };
  daily: Record<string, DailyResult>;
  streak: { current: number; best: number; lastDate: string | null };
  settings: { sound: boolean; haptics: boolean; symbols: boolean; lang: Lang | null };
  adsRemoved: boolean;
  seenIntros: string[];
  /** Ad pacing: completed levels since the last interstitial, and when it was shown. */
  ads: { levelsSince: number; lastShownAt: number };
  firstOpenAt: number;
}

const KEY = 'rotor.progress.v1';

const fresh = (): Progress => ({
  version: 1,
  unlocked: 1,
  stars: {},
  bestTurns: {},
  coins: 150,
  boosters: { undo: 5, hint: 3 },
  daily: {},
  streak: { current: 0, best: 0, lastDate: null },
  settings: { sound: true, haptics: true, symbols: false, lang: null },
  adsRemoved: false,
  seenIntros: [],
  ads: { levelsSince: 0, lastShownAt: 0 },
  firstOpenAt: Date.now(),
});

function load(): Progress {
  const raw = kv.get(KEY);
  if (!raw) return fresh();
  try {
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const base = fresh();
    return {
      ...base,
      ...parsed,
      boosters: { ...base.boosters, ...parsed.boosters },
      streak: { ...base.streak, ...parsed.streak },
      settings: { ...base.settings, ...parsed.settings },
      ads: { ...base.ads, ...parsed.ads },
    };
  } catch {
    return fresh();
  }
}

let state: Progress = load();
const listeners = new Set<() => void>();

export function getProgress(): Progress {
  return state;
}

export function update(fn: (p: Progress) => Progress): void {
  state = fn(state);
  kv.set(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

// ---------------------------------------------------------------------------
// Rewards and economy
// ---------------------------------------------------------------------------

export const PRICES = { hint: 60, undo: 25, extraTurns: 80 } as const;

export function starsFor(turns: number, par: number): number {
  if (turns <= par) return 3;
  if (turns <= par + 2) return 2;
  return 1;
}

export function coinsFor(stars: number, daily: boolean): number {
  return daily ? 30 + stars * 10 : 10 + stars * 5;
}

export function addCoins(n: number): void {
  update((p) => ({ ...p, coins: p.coins + n }));
}

/** Spend coins; returns false (and changes nothing) if the balance is too low. */
export function spendCoins(n: number): boolean {
  if (state.coins < n) return false;
  update((p) => ({ ...p, coins: p.coins - n }));
  return true;
}

export function consumeBooster(kind: 'undo' | 'hint'): boolean {
  if (state.boosters[kind] > 0) {
    update((p) => ({ ...p, boosters: { ...p.boosters, [kind]: p.boosters[kind] - 1 } }));
    return true;
  }
  return spendCoins(PRICES[kind]);
}

export function recordLevelWin(index: number, id: string, turns: number, par: number): { stars: number; coins: number; best: boolean } {
  const stars = starsFor(turns, par);
  const prevStars = state.stars[id] ?? 0;
  const coins = coinsFor(stars, false) + (prevStars === 0 ? 0 : -5); // replays earn a little less
  update((p) => ({
    ...p,
    unlocked: Math.max(p.unlocked, index + 2),
    stars: { ...p.stars, [id]: Math.max(prevStars, stars) },
    bestTurns: { ...p.bestTurns, [id]: Math.min(p.bestTurns[id] ?? Infinity, turns) },
    coins: p.coins + Math.max(5, coins),
    ads: { ...p.ads, levelsSince: p.ads.levelsSince + 1 },
  }));
  return { stars, coins: Math.max(5, coins), best: stars > prevStars };
}

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function previousDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d - 1, 12));
}

export function recordDaily(date: string, result: DailyResult): { coins: number; streak: number } {
  const already = state.daily[date]?.won;
  if (already) return { coins: 0, streak: state.streak.current };
  const stars = starsFor(result.turns, result.par);
  const coins = result.won ? coinsFor(stars, true) : 0;
  update((p) => {
    let { current, best, lastDate } = p.streak;
    if (result.won) {
      current = lastDate === previousDateKey(date) ? current + 1 : lastDate === date ? current : 1;
      best = Math.max(best, current);
      lastDate = date;
    }
    return {
      ...p,
      coins: p.coins + coins,
      daily: { ...p.daily, [date]: result },
      streak: { current, best, lastDate },
    };
  });
  return { coins, streak: state.streak.current };
}

/** Current streak, treating a missed yesterday as a broken streak. */
export function liveStreak(p: Progress, today = localDateKey()): number {
  const { lastDate, current } = p.streak;
  if (!lastDate) return 0;
  if (lastDate === today || lastDate === previousDateKey(today)) return current;
  return 0;
}

export function markIntroSeen(twist: string): void {
  if (state.seenIntros.includes(twist)) return;
  update((p) => ({ ...p, seenIntros: [...p.seenIntros, twist] }));
}

export function setSetting<K extends keyof Progress['settings']>(key: K, value: Progress['settings'][K]): void {
  update((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));
}
