import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the on-device key-value store.
const mem = new Map<string, string>();
vi.mock('../src/state/kv', () => ({
  kv: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v) },
}));

async function fresh(seed?: object) {
  mem.clear();
  if (seed) mem.set('rotor.progress.v1', JSON.stringify(seed));
  vi.resetModules();
  const store = await import('../src/state/store');
  const skins = await import('../src/skins');
  return { store, skins };
}

describe('star chests', () => {
  beforeEach(() => mem.clear());

  it('fills every 15 stars and opens once per 15', async () => {
    const { store } = await fresh();
    const { update, getProgress, chestProgress, openStarChest } = store;
    update((p) => ({ ...p, stars: { a: 3, b: 3, c: 3, d: 3 } })); // 12
    expect(chestProgress(getProgress())).toEqual({ have: 12, ready: 0 });
    expect(openStarChest()).toBeNull();
    update((p) => ({ ...p, stars: { ...p.stars, e: 3, f: 3, g: 3, h: 3, i: 3, j: 3 } })); // 30
    expect(chestProgress(getProgress()).ready).toBe(2);
    const coins = getProgress().coins;
    const r = openStarChest();
    expect(r).toEqual([
      { kind: 'coins', n: 60 },
      { kind: 'hint', n: 1 },
    ]);
    expect(getProgress().coins).toBe(coins + 60);
    expect(chestProgress(getProgress()).ready).toBe(1);
  });

  it('gives players from before chests exactly one ready chest', async () => {
    const stars: Record<string, number> = {};
    for (let i = 0; i < 45; i++) stars[`L${i}`] = 3; // 135 stars
    const { store } = await fresh({ version: 1, stars, coins: 500 });
    expect(store.chestProgress(store.getProgress())).toEqual({ have: 15, ready: 1 });
  });
});

describe('daily keys', () => {
  it('claims once per day, walks the 7-day calendar and pays a golden key on day 7', async () => {
    const { store } = await fresh();
    const { claimDailyKey, getProgress } = store;
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
    for (const d of days) {
      expect(claimDailyKey(d)).not.toBeNull();
      expect(claimDailyKey(d)).toBeNull(); // twice the same day
    }
    expect(getProgress().goldenKeys).toBe(1);
    expect(getProgress().keys.day).toBe(1); // wrapped
  });
});

describe('lockbox', () => {
  it('grants vault styles in order, once', async () => {
    const { skins, store } = await fresh();
    expect(skins.syncVaultSkins(3)).toEqual(['silver', 'marble', 'gems']);
    expect(skins.syncVaultSkins(3)).toEqual([]);
    expect(store.getProgress().skins.owned).toEqual(expect.arrayContaining(['brass', 'enamel', 'classic', 'silver', 'marble', 'gems']));
  });

  it('buys with coins, opens with a golden key, equips only owned styles', async () => {
    const { skins, store } = await fresh();
    store.update((p) => ({ ...p, coins: 1300, goldenKeys: 1 }));
    expect(skins.buySkin('midnight')).toBe(false); // 2000
    expect(skins.buySkin('marble')).toBe(true);
    expect(store.getProgress().coins).toBe(100);
    skins.equipSkin('neon'); // not owned: ignored
    expect(store.getProgress().skins.pins).toBe('enamel');
    expect(skins.openWithGoldenKey('neon')).toBe(true);
    skins.equipSkin('neon');
    expect(store.getProgress().skins.pins).toBe('neon');
    expect(store.getProgress().goldenKeys).toBe(0);
  });

  it('every pin set keeps six distinct colours', async () => {
    const { skins } = await fresh();
    for (const p of skins.PINS) expect(new Set(p.colors).size).toBe(6);
  });
});
