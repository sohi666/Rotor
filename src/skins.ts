import { useMemo } from 'react';
import { C, PIN_COLORS, PIN_RIMS } from './theme';
import { getProgress, spendCoins, update, useProgress, type Progress } from './state/store';
import type { Lang } from './i18n';

/**
 * Lockbox: cosmetic skins for the dial face, the pins and the hub. Cosmetic only, never
 * random when paid for. Sources: vault levels (fixed order), golden keys (pick any), coins.
 */
export type SkinKind = 'dial' | 'pins' | 'hub';

export interface DialSkin {
  id: string;
  kind: 'dial';
  name: Record<Lang, string>;
  price: number;
  face: string;
  track: string;
  trackAlt: string;
  trackLocked: string;
  groove: string;
  grooveDark: string;
  /** Rim gradient, light to deep. */
  rim: [string, string, string];
  /** Gear seams, hint arrows, active-ring glow. */
  accentLight: string;
  accentDeep: string;
  /** Padlocks and key glyphs. */
  ink: string;
}

export interface PinSkin {
  id: string;
  kind: 'pins';
  name: Record<Lang, string>;
  price: number;
  colors: readonly string[];
  rims: readonly string[];
  /** Highlight style drawn on each pin. */
  shine: 'dot' | 'facet' | 'gloss' | 'glow';
  /** Symbol colour for colour index 2 (the light one), others use white. */
  lightSymbol: string;
}

export interface HubSkin {
  id: string;
  kind: 'hub';
  name: Record<Lang, string>;
  price: number;
  metal: [string, string, string];
  well: string;
  text: string;
}

export type AnySkin = DialSkin | PinSkin | HubSkin;

export const DIALS: DialSkin[] = [
  {
    id: 'brass',
    kind: 'dial',
    name: { fr: 'Laiton', en: 'Brass' },
    price: 0,
    face: C.ivory,
    track: C.track,
    trackAlt: C.trackAlt,
    trackLocked: C.trackLocked,
    groove: C.groove,
    grooveDark: C.grooveDark,
    rim: [C.brassLight, C.brass, C.brassDeep],
    accentLight: C.brassLight,
    accentDeep: C.brassDeep,
    ink: C.ink,
  },
  {
    id: 'marble',
    kind: 'dial',
    name: { fr: 'Marbre', en: 'Marble' },
    price: 1200,
    face: '#F5F3EF',
    track: '#E7E3DC',
    trackAlt: '#DDD8CF',
    trackLocked: '#B8B1A6',
    groove: '#D0C9BD',
    grooveDark: '#A39B8E',
    rim: ['#F7F8F9', '#BFC5CB', '#7B838B'],
    accentLight: '#DCE1E5',
    accentDeep: '#68717A',
    ink: '#2B3036',
  },
  {
    id: 'copper',
    kind: 'dial',
    name: { fr: 'Cuivre', en: 'Copper' },
    price: 1200,
    face: '#F5E6D6',
    track: '#EAD0B7',
    trackAlt: '#E0C3A7',
    trackLocked: '#BC9A7C',
    groove: '#D7B597',
    grooveDark: '#A77E5D',
    rim: ['#F4BC93', '#C46E3F', '#7C3D1E'],
    accentLight: '#F4BC93',
    accentDeep: '#86462A',
    ink: '#3A2418',
  },
  {
    id: 'jade',
    kind: 'dial',
    name: { fr: 'Jade', en: 'Jade' },
    price: 1500,
    face: '#E6F1E9',
    track: '#D1E5D8',
    trackAlt: '#C4DCCC',
    trackLocked: '#9AB7A4',
    groove: '#B5CFBF',
    grooveDark: '#82A391',
    rim: ['#F2D88E', '#C9A23A', '#866618'],
    accentLight: '#F2D88E',
    accentDeep: '#2E6A4A',
    ink: '#1E3B2C',
  },
  {
    id: 'ice',
    kind: 'dial',
    name: { fr: 'Glace', en: 'Ice' },
    price: 1500,
    face: '#ECF5FB',
    track: '#D8E9F3',
    trackAlt: '#CBE0ED',
    trackLocked: '#9EBACB',
    groove: '#BCD4E2',
    grooveDark: '#8DADC1',
    rim: ['#FFFFFF', '#B5D1E5', '#6A90AB'],
    accentLight: '#D2E8F6',
    accentDeep: '#4D7A97',
    ink: '#1F3445',
  },
  {
    id: 'midnight',
    kind: 'dial',
    name: { fr: 'Minuit', en: 'Midnight' },
    price: 2000,
    face: '#18222F',
    track: '#223047',
    trackAlt: '#1D2A3E',
    trackLocked: '#3A475D',
    groove: '#2E3B53',
    grooveDark: '#4D5D7B',
    rim: ['#D2DDEC', '#8498B6', '#475876'],
    accentLight: '#7FD3FF',
    accentDeep: '#4FA3D9',
    ink: '#E6EEF8',
  },
];

export const PINS: PinSkin[] = [
  {
    id: 'enamel',
    kind: 'pins',
    name: { fr: 'Émail', en: 'Enamel' },
    price: 0,
    colors: PIN_COLORS,
    rims: PIN_RIMS,
    shine: 'dot',
    lightSymbol: C.ink,
  },
  {
    id: 'gems',
    kind: 'pins',
    name: { fr: 'Gemmes', en: 'Gems' },
    price: 1500,
    colors: ['#D3123E', '#1F52DA', '#F4B400', '#0EA36C', '#9A3FD3', '#FF7DB5'],
    rims: ['#8C0B28', '#12318E', '#B48300', '#07704A', '#672390', '#C7568A'],
    shine: 'facet',
    lightSymbol: '#3A2A00',
  },
  {
    id: 'candy',
    kind: 'pins',
    name: { fr: 'Bonbons', en: 'Candy' },
    price: 1500,
    colors: ['#FF4F61', '#3D7DFF', '#FFD447', '#3DDC97', '#A65DFF', '#FF8AD8'],
    rims: ['#C93242', '#2A56B8', '#C9A324', '#25A06B', '#7539BF', '#C95FA8'],
    shine: 'gloss',
    lightSymbol: '#5A4300',
  },
  {
    id: 'neon',
    kind: 'pins',
    name: { fr: 'Néon', en: 'Neon' },
    price: 2000,
    colors: ['#FF3B5C', '#2EC5FF', '#FFE53B', '#39FF88', '#B44DFF', '#FF5CE1'],
    rims: ['#B3203B', '#1A86B3', '#B3A01F', '#1FB35C', '#7A2BB3', '#B33D9E'],
    shine: 'glow',
    lightSymbol: '#4A4200',
  },
];

export const HUBS: HubSkin[] = [
  {
    id: 'classic',
    kind: 'hub',
    name: { fr: 'Classique', en: 'Classic' },
    price: 0,
    metal: [C.brassLight, C.brass, C.brassDeep],
    well: C.petrolDeep,
    text: C.ivory,
  },
  {
    id: 'silver',
    kind: 'hub',
    name: { fr: 'Argent', en: 'Silver' },
    price: 600,
    metal: ['#F5F7F9', '#B9C1C8', '#6E7983'],
    well: '#243038',
    text: '#F4F6F8',
  },
  {
    id: 'rosegold',
    kind: 'hub',
    name: { fr: 'Or rose', en: 'Rose gold' },
    price: 800,
    metal: ['#F8D6C8', '#D99A86', '#995C4C'],
    well: '#3A2421',
    text: '#FBE9E2',
  },
  {
    id: 'obsidian',
    kind: 'hub',
    name: { fr: 'Obsidienne', en: 'Obsidian' },
    price: 1000,
    metal: ['#5C616D', '#2B2F36', '#111316'],
    well: '#0B0C0E',
    text: C.brassLight,
  },
];

export const ALL_SKINS: AnySkin[] = [...DIALS, ...PINS, ...HUBS];
export const DEFAULT_OWNED = ['brass', 'enamel', 'classic'];

/** What each vault (every 10th level) unlocks, in order. */
export const VAULT_SKINS = ['silver', 'marble', 'gems', 'copper', 'rosegold', 'jade', 'candy', 'ice', 'obsidian', 'midnight', 'neon'];

export interface Skin {
  dial: DialSkin;
  pins: PinSkin;
  hub: HubSkin;
}

export const DEFAULT_SKIN: Skin = { dial: DIALS[0], pins: PINS[0], hub: HUBS[0] };

export function skinById(id: string): AnySkin | undefined {
  return ALL_SKINS.find((s) => s.id === id);
}

export function resolveSkin(sel: Progress['skins']): Skin {
  return {
    dial: DIALS.find((d) => d.id === sel.dial) ?? DIALS[0],
    pins: PINS.find((p) => p.id === sel.pins) ?? PINS[0],
    hub: HUBS.find((h) => h.id === sel.hub) ?? HUBS[0],
  };
}

export function useSkin(): Skin {
  const sel = useProgress().skins;
  return useMemo(() => resolveSkin(sel), [sel]);
}

export function owns(p: Progress, id: string): boolean {
  return p.skins.owned.includes(id);
}

/** Add a skin to the collection (no-op if owned). Returns true when it was new. */
export function grantSkin(id: string): boolean {
  const p = getProgress();
  if (!skinById(id) || owns(p, id)) return false;
  update((q) => ({ ...q, skins: { ...q.skins, owned: [...q.skins.owned, id] } }));
  return true;
}

export function equipSkin(id: string): void {
  const s = skinById(id);
  if (!s || !owns(getProgress(), id)) return;
  update((q) => ({ ...q, skins: { ...q.skins, [s.kind]: id } }));
}

export function buySkin(id: string): boolean {
  const s = skinById(id);
  if (!s || owns(getProgress(), id)) return false;
  if (!spendCoins(s.price)) return false;
  grantSkin(id);
  return true;
}

export function openWithGoldenKey(id: string): boolean {
  const p = getProgress();
  if (p.goldenKeys < 1 || owns(p, id) || !skinById(id)) return false;
  update((q) => ({ ...q, goldenKeys: q.goldenKeys - 1 }));
  grantSkin(id);
  return true;
}

/** Skins earned by vaults already cleared (also catches up players who cleared vaults before the Lockbox existed). */
export function syncVaultSkins(vaultsCleared: number): string[] {
  const fresh: string[] = [];
  for (let i = 0; i < Math.min(vaultsCleared, VAULT_SKINS.length); i++) {
    if (grantSkin(VAULT_SKINS[i])) fresh.push(VAULT_SKINS[i]);
  }
  return fresh;
}
