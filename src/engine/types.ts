/**
 * Rotor rules engine — shared types.
 *
 * A board is R concentric rings (index 0 = innermost) with S slots each.
 * Slots are addressed by absolute spoke position p in [0, S): rotating a
 * ring shifts its contents around the spokes. A spoke "unlocks" when every
 * ring has a pin of the same colour at that spoke (wild pins match any
 * colour); those pins burst and leave empty slots. Clear every pin to win.
 */

/** Cell codes (Int8). Colours 0..5 are stored as COLOR_BASE + c, keyed pins as KEY_BASE + c. */
export const EMPTY = 0;
export const BOLT = 1;
export const WILD = 2;
export const COLOR_BASE = 3;
export const KEY_BASE = 9;
export const MAX_COLORS = 6;

/**
 * A one-way gear: turning `driver` also turns `follower` (dir 1 = same way,
 * -1 = counter-rotating). Turning the follower on its own leaves the driver still.
 */
export type Link = readonly [driver: number, follower: number, dir: 1 | -1];

/** A turn: rotate `ring` by `d` notches (1..S-1, clockwise). Linked rings follow. */
export interface Move {
  ring: number;
  d: number;
}

/** Serialized level, as stored in levels.json / daily.json. */
export interface LevelDef {
  id: string;
  /** Slots per ring (spokes). */
  spokes: number;
  /**
   * One string per ring, inner → outer, `spokes` chars each.
   * a-f colour, A-F keyed pin of that colour, '.' empty, '#' bolt, '*' wild.
   */
  rings: string[];
  links?: Link[];
  /** Rings that start locked; each cleared key unlocks the next ring in this list. */
  locks?: number[];
  /** Optimal number of turns (solver-verified). */
  par: number;
  /** Turn budget; 0 = unlimited (pressure-free onboarding levels). */
  budget: number;
  /** One optimal solution from the start state. */
  solution: [ring: number, d: number][];
  /** Mechanic introduced on this level, shown as a tutorial card. */
  intro?: Twist;
  /** Generator difficulty score (higher = harder). */
  difficulty: number;
}

export type Twist = 'basics' | 'bolt' | 'link' | 'wild' | 'counter' | 'lock';

export interface GameState {
  readonly R: number;
  readonly S: number;
  /** R*S cells, index r*S + p. */
  readonly cells: Int8Array;
  /** Bitmask of currently locked rings. */
  readonly locked: number;
  /** Order in which locked rings are released by keys. */
  readonly lockOrder: readonly number[];
  readonly links: readonly Link[];
}

export interface TurnResult {
  state: GameState;
  /** Every ring that moved and by how many notches (normalized to 0..S-1). */
  moved: Move[];
  /** Spokes that unlocked this turn. */
  cleared: number[];
  /** Rings unlocked by keys cleared this turn. */
  unlocked: number[];
}
