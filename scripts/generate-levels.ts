/**
 * Generates the campaign (src/data/levels.json) and the daily locks
 * (src/data/daily.json). Every level is solved by BFS, so its par is the true
 * optimum and its stored solution is a proof that it can be cleared.
 *
 *   npx tsx scripts/generate-levels.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fromDef, solve } from '../src/engine';
import { generate, type GenSpec, twistsOf } from '../src/engine/generator';
import { hashString, mulberry32 } from '../src/engine/rng';
import type { LevelDef, Twist } from '../src/engine/types';

const OUT = join(__dirname, '..', 'src', 'data');
const CAMPAIGN = 200;
const DAILY_FROM = '2026-11-01';
const DAILY_TO = '2027-12-31';

const INTROS: Record<number, Twist> = { 1: 'basics', 21: 'bolt', 31: 'link', 51: 'wild', 61: 'counter', 81: 'lock' };

function p(lo: number, hi: number): [number, number] {
  return [lo, hi];
}

type Tier = 1 | 2 | 3 | 'boss';

/** Within each block of ten: 1-3 easy, 4-6 medium, 7-9 hard, 10 = vault. */
function tierOf(n: number): Tier {
  const k = n % 10;
  return k === 0 ? 'boss' : k <= 3 ? 1 : k <= 6 ? 2 : 3;
}

/**
 * A block introducing (or practising) a mechanic: the easy tier uses few pins so
 * the new rule is learned in isolation; later tiers add pins and colours.
 */
function block(twist: Partial<GenSpec>, n: number, opts: { rings?: number; spokes?: number; boss?: Partial<GenSpec> } = {}): GenSpec {
  const rings = opts.rings ?? 3;
  const spokes = opts.spokes ?? 8;
  const base = { rings, spokes, ...twist };
  switch (tierOf(n)) {
    case 1:
      return { ...base, colors: 2, pins: 4, par: p(2, 3) };
    case 2:
      return { ...base, colors: 3, pins: 5, par: p(3, 4) };
    case 3:
      return { ...base, colors: 3, pins: 6, par: p(4, 5) };
    default:
      return { ...base, colors: 3, pins: 6, par: p(5, 6), minGap: 1, ...opts.boss };
  }
}

/** Level spec for campaign level n (1-based). Every 10th level is a "vault" boss. */
function specFor(n: number): GenSpec {
  const t = tierOf(n);
  if (n <= 10) {
    if (t === 1) return { rings: 2, spokes: 6, colors: 2, pins: 4, par: p(2, 2) };
    if (t === 2) return { rings: 2, spokes: 6, colors: 3, pins: 5, par: p(2, 3) };
    if (t === 3) return { rings: 2, spokes: 6, colors: 3, pins: 6, par: p(3, 3) };
    return { rings: 2, spokes: 6, colors: 3, pins: 6, par: p(3, 4), minGap: 1 };
  }
  if (n <= 20) return block({}, n, { spokes: 6, boss: { par: p(4, 5) } });
  if (n <= 30) return block({ bolts: t === 3 || t === 'boss' ? 2 : 1 }, n, { boss: { par: p(5, 5) } });
  if (n <= 40) return block({ link: 'same' }, n, { boss: { bolts: 1 } });
  if (n <= 50) return block(n % 2 ? { bolts: 1 } : { link: 'same' }, n, { boss: { colors: 4, pins: 8, minGap: 2 } });
  if (n <= 60) return block({ wilds: 1 }, n, { boss: { wilds: 2, bolts: 1 } });
  if (n <= 70) return block({ link: 'counter' }, n, { boss: { bolts: 1 } });
  if (n <= 80) return t === 'boss' ? { ...mixed(n, p(6, 7)), minGap: 1 } : mixed(n, t === 1 ? p(3, 4) : t === 2 ? p(4, 5) : p(4, 6), t === 1);
  if (n <= 90) return block({ lock: true }, n, { boss: { link: 'counter', par: p(5, 7) } });
  if (n <= 100) return block({}, n, { rings: 4, spokes: 6, boss: { bolts: 1, pins: 5, par: p(6, 6) } });
  const late = n > 150;
  if (t === 'boss') return { ...mixed(n, late ? p(7, 8) : p(6, 7)), minGap: 2 };
  if (t === 1) return mixed(n, p(4, 5), true);
  if (t === 2) return mixed(n, late ? p(4, 6) : p(4, 5));
  return mixed(n, late ? p(5, 7) : p(5, 6));
}

/** Deterministic mix of two twists on a 3-ring/8-spoke or 4-ring/6-spoke board. */
function mixed(n: number, par: [number, number], light = false): GenSpec {
  const rng = mulberry32(hashString(`mix:${n}`));
  const four = rng() < 0.3;
  const base: GenSpec = four
    ? { rings: 4, spokes: 6, colors: 3, pins: light ? 4 : 5, par }
    : { rings: 3, spokes: 8, colors: rng() < 0.5 ? 3 : 4, pins: light ? 5 : rng() < 0.5 ? 6 : 8, par };
  const pool: ((s: GenSpec) => GenSpec)[] = [
    (s) => ({ ...s, bolts: 1 }),
    (s) => ({ ...s, link: 'same' }),
    (s) => ({ ...s, link: 'counter' }),
    (s) => ({ ...s, wilds: 1 }),
    (s) => ({ ...s, lock: true }),
  ];
  const picks = pool.map((f, i) => ({ f, k: rng() + (i === 0 ? 0.1 : 0) })).sort((a, b) => a.k - b.k);
  let spec = base;
  for (const { f } of picks.slice(0, 2)) spec = f(spec);
  if (spec.pins === 8 && spec.bolts) spec = { ...spec, pins: 6 }; // keep a free slot for the bolt
  return spec;
}

function budgetFor(n: number, par: number): number {
  if (n <= 35) return 0; // pressure-free onboarding: no turn limit, stars only
  if (n <= 60) return par + 4;
  if (n <= 100) return par + 3;
  return par + 2;
}

function campaign(): LevelDef[] {
  const levels: LevelDef[] = [];
  // Level 1 is hand-made: one turn unlocks three spokes at once.
  const first = { spokes: 6, rings: ['a.a.a.', '.a.a.a'] };
  const res = solve(fromDef(first));
  levels.push({
    id: 'L001',
    ...first,
    par: res.par,
    budget: 0,
    solution: res.path.map((m) => [m.ring, m.d]),
    intro: 'basics',
    difficulty: 1,
  });
  for (let block = 0; block < CAMPAIGN / 10; block++) {
    const from = block * 10 + 1;
    const made: { n: number; def: Omit<LevelDef, 'id' | 'budget' | 'intro'> }[] = [];
    for (let n = Math.max(from, 2); n < from + 10; n++) {
      const spec = specFor(n);
      const c = generate(spec, hashString(`level:${n}`));
      made.push({ n, def: c.def });
    }
    // Ramp within the block: regular levels easiest → hardest, the boss stays last.
    const boss = made.pop()!;
    const intro = made.find((m) => INTROS[m.n]);
    const rest = made.filter((m) => m !== intro).sort((a, b) => a.def.difficulty - b.def.difficulty);
    const ordered = [...(intro ? [intro] : []), ...rest, boss];
    ordered.forEach((m, i) => {
      const n = from + (from === 1 ? 1 : 0) + i;
      levels.push({
        id: `L${String(n).padStart(3, '0')}`,
        ...m.def,
        budget: budgetFor(n, m.def.par),
        ...(INTROS[n] ? { intro: INTROS[n] } : {}),
      });
    });
  }
  return levels;
}

const DAILY_SPECS: Record<number, GenSpec> = {
  1: { rings: 3, spokes: 6, colors: 3, pins: 6, par: p(3, 4) },
  2: { rings: 3, spokes: 8, colors: 3, pins: 6, bolts: 1, par: p(4, 5) },
  3: { rings: 3, spokes: 8, colors: 3, pins: 6, link: 'same', par: p(4, 5) },
  4: { rings: 3, spokes: 8, colors: 3, pins: 6, wilds: 1, par: p(4, 5) },
  5: { rings: 3, spokes: 8, colors: 4, pins: 8, link: 'counter', par: p(5, 6), minGap: 1 },
  6: { rings: 3, spokes: 8, colors: 3, pins: 6, lock: true, par: p(5, 6) },
  0: { rings: 4, spokes: 6, colors: 3, pins: 5, bolts: 1, par: p(5, 7), minGap: 1 },
};

function* dates(from: string, to: string): Generator<string> {
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function daily(): Record<string, LevelDef> {
  const out: Record<string, LevelDef> = {};
  for (const date of dates(DAILY_FROM, DAILY_TO)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const spec = DAILY_SPECS[weekday];
    const c = generate(spec, hashString(`daily:${date}`));
    out[date] = { id: `D${date}`, ...c.def, budget: c.def.par + 3 };
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
const only = process.argv[2]; // 'campaign' | 'daily' | undefined (both)
const t0 = Date.now();
const levels = only === 'daily' ? (require('../src/data/levels.json') as LevelDef[]) : campaign();
if (only !== 'daily') {
  writeFileSync(join(OUT, 'levels.json'), JSON.stringify(levels));
  console.log(`campaign: ${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (only !== 'campaign') {
  const t1 = Date.now();
  const days = daily();
  writeFileSync(join(OUT, 'daily.json'), JSON.stringify(days));
  console.log(`daily: ${Object.keys(days).length} locks in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
}
const parHist: Record<number, number> = {};
for (const l of levels) parHist[l.par] = (parHist[l.par] ?? 0) + 1;
console.log('campaign par histogram', parHist);
console.log(
  'twists',
  levels.reduce<Record<string, number>>((acc, l) => {
    for (const t of twistsOf({
      rings: l.rings.length,
      spokes: l.spokes,
      colors: 0,
      pins: 0,
      par: [0, 0],
      bolts: l.rings.some((r) => r.includes('#')) ? 1 : 0,
      link: l.links?.[0]?.[2] === 1 ? 'same' : l.links?.[0]?.[2] === -1 ? 'counter' : undefined,
      wilds: l.rings.some((r) => r.includes('*')) ? 1 : 0,
      lock: !!l.locks?.length,
    }))
      acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {}),
);
