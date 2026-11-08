/**
 * Raw store screenshots from the web preview (Playwright). Compose them with captions afterwards:
 *   npm run web:export && npx serve dist -l 8090   (or python3 -m http.server 8090 -d dist)
 *   node scripts/store/shots.cjs && python3 scripts/store/compose.py
 * Raw captures go to store-screenshots/raw/<device>/<locale>/NN-name.png (git-ignored).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'store-screenshots/raw');
const BASE = process.env.SHOTS_URL || 'http://localhost:8090';
const levels = require(path.join(ROOT, 'src/data/levels.json'));

const DEVICES = {
  iphone69: { viewport: { width: 440, height: 956 }, dsf: 3 },
  ipad13: { viewport: { width: 1032, height: 1376 }, dsf: 2 },
  android: { viewport: { width: 414, height: 736 }, dsf: 3 },
};
// Moves worked out from the game's own rules (see scripts/store/README.md).
const SAFE_LEVEL = 15;
const SAFE_TURNS = [14, -26, 10]; // notches clockwise(+) for combination 26 -> 12 -> 2
const RUSH_LEVEL = 10;
const RUSH_MOVE = [0, 6]; // ring 0 by 6 notches clears three spokes (x3 combo)

const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function progress(lang, extra = {}) {
  const stars = {};
  for (let i = 1; i <= 41; i++) stars[`L${String(i).padStart(3, '0')}`] = i % 7 === 3 ? 2 : 3;
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return JSON.stringify({
    version: 1,
    unlocked: 42,
    stars,
    bestTurns: {},
    coins: 860,
    boosters: { undo: 5, hint: 3 },
    daily: {},
    streak: { current: 5, best: 9, lastDate: day(y) },
    settings: { sound: false, haptics: false, symbols: false, lang },
    adsRemoved: false,
    seenIntros: ['basics', 'bolt', 'link', 'wild', 'counter', 'lock', 'safe', 'rush'],
    ads: { levelsSince: 0, lastShownAt: 0 },
    firstOpenAt: Date.now(),
    chests: { opened: 7, starsSpent: total - 15 }, // one chest ready
    keys: { day: 4, lastClaim: null },
    goldenKeys: 1,
    skins: { owned: ['brass', 'enamel', 'classic', 'silver', 'marble', 'gems', 'copper'], dial: 'brass', pins: 'enamel', hub: 'classic' },
    bonus: { safes: 1, rushes: 1, bestRush: 120 },
    ...extra,
  });
}

async function boardGeometry(page, n) {
  const lv = levels[n - 1];
  const boxes = await page.locator('canvas').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const b = boxes.filter((x) => Math.abs(x.w - x.h) < 2).sort((a, c) => c.w - a.w)[0];
  const R = lv.rings.length, S = lv.spokes, size = b.w;
  const hub = size * (R >= 4 ? 0.1 : 0.12);
  return { lv, S, cx: b.x + size / 2, cy: b.y + size / 2, hub, band: (size * 0.47 * 0.93 - hub) / R, size };
}

async function drag(page, cx, cy, rad, startDeg, deltaDeg, { hold = false, steps } = {}) {
  const pt = (deg) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)];
  let [x, y] = pt(startDeg);
  await page.mouse.move(x, y);
  await page.mouse.down();
  const n = steps ?? Math.max(10, Math.ceil(Math.abs(deltaDeg) / 4));
  for (let i = 1; i <= n; i++) {
    [x, y] = pt(startDeg + (deltaDeg * i) / n);
    await page.mouse.move(x, y);
    await page.waitForTimeout(10);
  }
  if (!hold) await page.mouse.up();
}

async function turn(page, g, ring, d, settle = 450, hold = false) {
  const notches = d > g.S / 2 ? d - g.S : d;
  const rad = g.hub + g.band * (ring + 0.5);
  await drag(page, g.cx, g.cy, rad, -90 + 180 / g.S, (notches * 360) / g.S, { hold });
  if (!hold) await page.waitForTimeout(settle);
}

(async () => {
  const browser = await chromium.launch();
  for (const [dev, cfg] of Object.entries(DEVICES)) {
    for (const [locale, lang] of [['fr-CA', 'fr'], ['en-US', 'en']]) {
      const dir = path.join(OUT, dev, locale);
      fs.mkdirSync(dir, { recursive: true });
      const shot = (name) => page.screenshot({ path: path.join(dir, `${name}.png`) });
      let ctx, page;
      const open = async (url, seed = {}) => {
        if (ctx) await ctx.close();
        ctx = await browser.newContext({ viewport: cfg.viewport, deviceScaleFactor: cfg.dsf, locale });
        await ctx.addInitScript((p) => localStorage.setItem('rotor.progress.v1', p), progress(lang, seed));
        page = await ctx.newPage();
        await page.goto(`${BASE}/${url}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1600);
      };

      // 1. Hero: a ring mid-turn, five spokes about to line up.
      await open('?level=126');
      let g = await boardGeometry(page, 126);
      await turn(page, g, ...g.lv.solution[0], 700);
      await turn(page, g, ...g.lv.solution[1], 0, true);
      await page.waitForTimeout(300);
      await shot('01-align');
      await page.mouse.up();

      // 2. Win celebration (3 stars: rays, confetti shower, coins flying to the counter).
      await open('?level=102');
      g = await boardGeometry(page, 102);
      for (const m of g.lv.solution) await turn(page, g, ...m);
      await page.waitForTimeout(820);
      await shot('02-celebrate');

      // 3. Safecracker, just opened: prizes inside, coin fountain.
      await open(`?safe=${SAFE_LEVEL}`);
      {
        const box = (await page.locator('canvas').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })))
          .filter((x) => Math.abs(x.w - x.h) < 2).sort((a, c) => c.w - a.w)[0];
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2, rad = box.w * 0.3;
        let a = -90;
        for (const n of SAFE_TURNS) {
          await drag(page, cx, cy, rad, a, n * 9, { steps: Math.ceil(Math.abs(n) * 2.2) });
          a += n * 9;
          await page.waitForTimeout(500);
        }
        await page.waitForTimeout(2000);
        await shot('03-safe');
      }

      // 4. Golden Rush: a triple payout.
      await open(`?rush=${RUSH_LEVEL}`);
      {
        const box = (await page.locator('canvas').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })))
          .filter((x) => Math.abs(x.w - x.h) < 2).sort((a, c) => c.w - a.w)[0];
        const size = box.w, hub = size * 0.12, band = (size * 0.47 * 0.93 - hub) / 3;
        await turn(page, { S: 8, cx: box.x + size / 2, cy: box.y + size / 2, hub, band }, ...RUSH_MOVE, 260);
        await shot('04-rush');
      }

      // 5. Lockbox: a premium style on the live preview.
      await open('?screen=lockbox', {
        coins: 2400,
        skins: { owned: ['brass', 'enamel', 'classic', 'silver', 'marble', 'gems', 'copper', 'midnight', 'neon', 'obsidian'], dial: 'midnight', pins: 'neon', hub: 'obsidian' },
      });
      await shot('05-lockbox');

      // 6. Home: today's lock, a daily key and a chest waiting.
      await open('');
      await shot('06-home');

      // 7. A gear vault board.
      await open('?level=90');
      await shot('07-gears');

      await ctx.close();
      console.log('done', dev, locale);
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
