/**
 * "Fair Lock" check: re-solves every campaign level and daily lock from scratch
 * and fails if any stored par is not the true optimum or a solution is invalid.
 *
 *   npx tsx scripts/verify-levels.ts
 */
import { applyTurn, findClears, fromDef, isWon, solve } from '../src/engine';
import levels from '../src/data/levels.json';
import daily from '../src/data/daily.json';
import type { LevelDef } from '../src/engine/types';

const all: LevelDef[] = [...(levels as unknown as LevelDef[]), ...Object.values(daily as unknown as Record<string, LevelDef>)];
let failures = 0;
const t0 = Date.now();
for (const lv of all) {
  const start = fromDef(lv);
  const problems: string[] = [];
  if (findClears(start.cells, start.R, start.S).length) problems.push('free clear at start');
  let s = start;
  for (const [ring, d] of lv.solution) {
    const r = applyTurn(s, ring, d);
    if (!r) {
      problems.push(`illegal move ${ring}/${d}`);
      break;
    }
    s = r.state;
  }
  if (!isWon(s)) problems.push('stored solution does not clear the board');
  const res = solve(start, { maxDepth: lv.par });
  if (res.status !== 'solved') problems.push(`solver: ${res.status}`);
  else if (res.par !== lv.par) problems.push(`par ${lv.par} but optimum is ${res.par}`);
  if (lv.budget && lv.budget < lv.par) problems.push('budget below par');
  if (problems.length) {
    failures++;
    console.error(`${lv.id}: ${problems.join('; ')}`);
  }
}
console.log(`${all.length} levels verified in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${failures} failures`);
process.exit(failures ? 1 : 0);
