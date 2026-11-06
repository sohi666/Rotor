/** Rotor visual tokens: a vintage instrument dial — petrol case, ivory face, brass, enamel pins. */
export const C = {
  petrol: '#0F5257',
  petrolDeep: '#0A3B3F',
  petrolSoft: '#17676D',
  petrolLine: '#2A7A7F',
  ivory: '#F2E8D5',
  ivoryDim: '#C9D6D2',
  track: '#E2D5BC',
  trackAlt: '#D9CBAE',
  trackLocked: '#B3A487',
  groove: '#CDBE9F',
  grooveDark: '#A8977A',
  ink: '#22302F',
  brass: '#C9973A',
  brassLight: '#E6C27A',
  brassDeep: '#8F6A24',
  steel: '#5B6770',
  steelLight: '#8A97A0',
  danger: '#E5483B',
  scrim: 'rgba(6, 34, 37, 0.72)',
} as const;

/** Enamel pin colours, index = engine colour 0..5. */
// Order matters: the first colours appear on every board, so 0/1 are red/blue (distinct for all common colour-vision types).
export const PIN_COLORS = ['#E5483B', '#2F5FD0', '#F2A93B', '#3FA34D', '#8E44AD', '#F07AA8'] as const;
/** Darker rims for each pin colour. */
export const PIN_RIMS = ['#B5332A', '#2246A0', '#C7831F', '#2C7A37', '#6A3082', '#C45585'] as const;
/** Emoji used in share cards for each colour (spoiler-free cards only use the turn markers). */
export const PIN_NAMES_FR = ['rouge', 'bleu', 'jaune', 'vert', 'prune', 'rose'] as const;
export const PIN_NAMES_EN = ['red', 'blue', 'yellow', 'green', 'plum', 'pink'] as const;

export const F = {
  display: 'Unbounded_700Bold',
  displayMedium: 'Unbounded_500Medium',
  ui: 'Figtree_500Medium',
  uiSemi: 'Figtree_600SemiBold',
  uiBold: 'Figtree_700Bold',
} as const;

/** Type scale (points), roughly a 1.25 ratio. */
export const T = {
  hero: 44,
  title: 28,
  heading: 20,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
