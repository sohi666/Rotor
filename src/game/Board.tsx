import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  Path,
  RadialGradient,
  Skia,
  SweepGradient,
  Text as SkText,
  useClock,
  useFont,
  vec,
  type SkFont,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { BOLT, colorOf, EMPTY, isKey, WILD } from '../engine';
import { C, PIN_COLORS, PIN_RIMS } from '../theme';
import { makeLayout, mod, polar, ringMid, slotAngle, type BoardLayout } from './geometry';
import { arcArrowPath, chevronPath, hexPath, keyPath, padlockPaths, symbolPath } from './glyphs';
import type { Game, UnlockEvent } from './useGame';

const MAX_RINGS = 5;
const SNAP_MS = 120;
/** Fraction of a notch the ring must travel past the last tick before the next one (0.5 = no hysteresis). */
const NOTCH_CATCH = 0.62;

interface Props {
  game: Game;
  size: number;
  symbols: boolean;
  /** Number shown in the hub (turns left, or turns used when unlimited). */
  hubValue: number;
  onNotch: (n: number) => void;
  onDeny: (ring: number) => void;
  onTurnStart?: () => void;
}

export function Board({ game, size, symbols, hubValue, onNotch, onDeny, onTurnStart }: Props) {
  const { state, offsets, status, event, hint } = game;
  const L = useMemo(() => makeLayout(size, state.R, state.S), [size, state.R, state.S]);
  const hubFont = useFont(require('@expo-google-fonts/figtree/800ExtraBold/Figtree_800ExtraBold.ttf'), L.hub * 0.82);

  // --- Shared values for the UI thread ------------------------------------
  const a0 = useSharedValue(0);
  const a1 = useSharedValue(0);
  const a2 = useSharedValue(0);
  const a3 = useSharedValue(0);
  const a4 = useSharedValue(0);
  const angles = useMemo(() => [a0, a1, a2, a3, a4], [a0, a1, a2, a3, a4]);
  const bases = useSharedValue<number[]>(offsets);
  const groups = useSharedValue<number[][]>([]);
  const geo = useSharedValue({ cx: L.cx, cy: L.cy, hub: L.hub, band: L.band, rim: L.rim, step: L.step, R: L.R });
  const activeRing = useSharedValue(-1);
  const accum = useSharedValue(0);
  const lastAngle = useSharedValue(0);
  const lastNotch = useSharedValue(0);
  const busy = useSharedValue(false);

  useEffect(() => {
    geo.value = { cx: L.cx, cy: L.cy, hub: L.hub, band: L.band, rim: L.rim, step: L.step, R: L.R };
  }, [L, geo]);

  // Ring groups (who moves with whom), empty when the ring can't turn or the level is over.
  useEffect(() => {
    const g: number[][] = [];
    for (let r = 0; r < state.R; r++) {
      const grp = status === 'playing' ? game.groupFor(r) : null;
      g.push(grp ? grp.flat() : []);
    }
    groups.value = g;
  }, [state, status, game, groups]);

  // Keep ring angles in step with committed offsets (instant after a turn, a quick rewind after undo/restart).
  useEffect(() => {
    bases.value = offsets;
    for (let r = 0; r < state.R; r++) {
      const target = offsets[r] * L.step;
      if (Math.abs(angles[r].value - target) > 1e-4) {
        angles[r].value = withTiming(target, { duration: 260, easing: Easing.out(Easing.cubic) });
      }
    }
    busy.value = false;
  }, [offsets, L.step, state.R, angles, bases, busy]);

  // --- JS callbacks reachable from worklets -------------------------------
  const commitRef = useRef(game.commit);
  commitRef.current = game.commit;
  const onCommit = useCallback(
    (ring: number, n: number) => {
      if (n === 0) {
        busy.value = false;
        return;
      }
      commitRef.current(ring, n);
    },
    [busy],
  );
  const notchRef = useRef(onNotch);
  notchRef.current = onNotch;
  const denyRef = useRef(onDeny);
  denyRef.current = onDeny;
  const startRef = useRef(onTurnStart);
  startRef.current = onTurnStart;
  const jsNotch = useCallback((n: number) => notchRef.current(n), []);
  const jsDeny = useCallback(
    (ring: number) => {
      denyRef.current(ring);
      const a = angles[ring];
      const base = a.value;
      a.value = withSequence(withTiming(base + 0.07, { duration: 50 }), withTiming(base - 0.05, { duration: 70 }), withTiming(base, { duration: 60 }));
    },
    [angles],
  );
  const jsStart = useCallback(() => startRef.current?.(), []);

  const pan = usePanGesture({
    minDistance: 1,
    onBegin: (e) => {
      'worklet';
      activeRing.value = -1;
      if (busy.value) return;
      const g = geo.value;
      const dx = e.x - g.cx;
      const dy = e.y - g.cy;
      const rad = Math.sqrt(dx * dx + dy * dy);
      if (rad < g.hub * 0.85 || rad > g.rim + 28) return;
      let r = Math.floor((rad - g.hub) / g.band);
      if (r < 0) r = 0;
      if (r > g.R - 1) r = g.R - 1;
      const grp = groups.value[r];
      if (!grp || grp.length === 0) {
        scheduleOnRN(jsDeny, r);
        return;
      }
      activeRing.value = r;
      lastAngle.value = Math.atan2(dy, dx);
      accum.value = 0;
      lastNotch.value = 0;
      scheduleOnRN(jsStart);
    },
    onUpdate: (e) => {
      'worklet';
      const r = activeRing.value;
      if (r < 0) return;
      const g = geo.value;
      const ang = Math.atan2(e.y - g.cy, e.x - g.cx);
      let d = ang - lastAngle.value;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      lastAngle.value = ang;
      accum.value += d;
      const grp = groups.value[r];
      const b = bases.value;
      for (let i = 0; i < grp.length; i += 2) {
        const ring = grp[i];
        angles[ring].value = b[ring] * g.step + accum.value * grp[i + 1];
      }
      // Detent with hysteresis: a notch ticks only once the ring is NOTCH_CATCH past the
      // last ticked notch, so a finger resting on the halfway line can't buzz back and forth.
      const pos = accum.value / g.step;
      const last = lastNotch.value;
      if (pos > last + NOTCH_CATCH || pos < last - NOTCH_CATCH) {
        const n = Math.round(pos);
        if (n !== last) {
          lastNotch.value = n;
          scheduleOnRN(jsNotch, n);
        }
      }
    },
    onFinalize: () => {
      'worklet';
      const r = activeRing.value;
      if (r < 0) return;
      activeRing.value = -1;
      const g = geo.value;
      const n = Math.round(accum.value / g.step);
      const grp = groups.value[r];
      const b = bases.value;
      busy.value = true;
      for (let i = 0; i < grp.length; i += 2) {
        const ring = grp[i];
        const target = (b[ring] + n * grp[i + 1]) * g.step;
        if (i === 0) {
          angles[ring].value = withTiming(target, { duration: SNAP_MS, easing: Easing.out(Easing.cubic) }, () => {
            'worklet';
            scheduleOnRN(onCommit, r, n);
          });
        } else {
          angles[ring].value = withTiming(target, { duration: SNAP_MS, easing: Easing.out(Easing.cubic) });
        }
      }
    },
  });

  // --- Derived transforms and highlights ----------------------------------
  const t0 = useDerivedValue(() => [{ rotate: a0.value }]);
  const t1 = useDerivedValue(() => [{ rotate: a1.value }]);
  const t2 = useDerivedValue(() => [{ rotate: a2.value }]);
  const t3 = useDerivedValue(() => [{ rotate: a3.value }]);
  const t4 = useDerivedValue(() => [{ rotate: a4.value }]);
  const transforms = [t0, t1, t2, t3, t4];

  const activeOpacity = (r: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDerivedValue(() => {
      const a = activeRing.value;
      if (a < 0) return 0;
      if (a === r) return 0.75;
      const grp = groups.value[a] ?? [];
      for (let i = 2; i < grp.length; i += 2) if (grp[i] === r) return 0.4;
      return 0;
    });
  const h0 = activeOpacity(0);
  const h1 = activeOpacity(1);
  const h2 = activeOpacity(2);
  const h3 = activeOpacity(3);
  const h4 = activeOpacity(4);
  const highlights = [h0, h1, h2, h3, h4];

  // --- Burst effects --------------------------------------------------------
  const clock = useClock();
  const [bursts, setBursts] = useState<{ ev: UnlockEvent; t0: number }[]>([]);
  useEffect(() => {
    if (!event) return;
    const t = clock.value;
    setBursts((b) => [...b.filter((x) => t - x.t0 < 1200), { ev: event, t0: t }]);
    const timer = setTimeout(() => setBursts((b) => b.filter((x) => x.ev.id !== event.id)), 1300);
    return () => clearTimeout(timer);
  }, [event, clock]);

  // Hint pulse.
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = hint ? withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true) : 0;
  }, [hint, pulse]);
  const hintOpacity = useDerivedValue(() => 0.35 + pulse.value * 0.65);

  // --- Static geometry ------------------------------------------------------
  const spokeLines = useMemo(() => {
    const lines: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
    for (let p = 0; p < L.S; p++) {
      const ang = slotAngle(L, p);
      lines.push({ a: polar(L, L.hub * 1.02, ang), b: polar(L, L.rim * 0.95, ang) });
    }
    return lines;
  }, [L]);

  // Gears: a dashed brass seam between driver and follower, plus direction arrows at 3 and 9 o'clock.
  const gears = useMemo(() => {
    return state.links.map(([driver, follower, dir]) => {
      const seam = L.hub + L.band * Math.max(driver, follower);
      const arrows: ReturnType<typeof chevronPath>[] = [];
      for (const base of [0, Math.PI]) {
        const ang = base + L.step / 2;
        const tangent = ang + Math.PI / 2; // clockwise
        const pd = polar(L, ringMid(L, driver), ang);
        const pf = polar(L, ringMid(L, follower), ang);
        const s = L.band * 0.3;
        arrows.push(chevronPath(pd.x, pd.y, s, tangent));
        arrows.push(chevronPath(pf.x, pf.y, s, dir === 1 ? tangent : tangent + Math.PI));
      }
      return { seam, arrows };
    });
  }, [state.links, L]);

  const hintArrow = useMemo(() => {
    if (!hint) return null;
    const rad = ringMid(L, hint.ring) + L.band * 0.5 - 2;
    return arcArrowPath(L.cx, L.cy, rad, -Math.PI / 2 - L.step * 0.25, hint.notches * L.step, L.band * 0.18);
  }, [hint, L]);

  const hubText = String(hubValue);
  const hubTextWidth = hubFont ? hubFont.getTextWidth(hubText) : 0;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width: size, height: size }} accessible={false}>
        <Canvas style={{ width: size, height: size }}>
          {/* Brass rim and ivory dial face */}
          <Circle cx={L.cx} cy={L.cy} r={L.rim + size * 0.02}>
            <RadialGradient c={vec(L.cx, L.cy - L.rim * 0.3)} r={L.rim * 1.3} colors={[C.brassLight, C.brass, C.brassDeep]} />
          </Circle>
          <Circle cx={L.cx} cy={L.cy} r={L.rim} color={C.ivory} />

          {/* Ring tracks */}
          {Array.from({ length: state.R }, (_, r) => {
            const locked = !!(state.locked & (1 << r));
            return (
              <Circle
                key={`track${r}`}
                cx={L.cx}
                cy={L.cy}
                r={ringMid(L, r)}
                style="stroke"
                strokeWidth={L.band * 0.9}
                color={locked ? C.trackLocked : r % 2 ? C.trackAlt : C.track}
              />
            );
          })}
          {Array.from({ length: state.R + 1 }, (_, r) => (
            <Circle key={`groove${r}`} cx={L.cx} cy={L.cy} r={L.hub + L.band * r} style="stroke" strokeWidth={1} color={C.groove} />
          ))}

          {/* Active-ring glow */}
          {Array.from({ length: state.R }, (_, r) => (
            <Circle
              key={`hl${r}`}
              cx={L.cx}
              cy={L.cy}
              r={ringMid(L, r)}
              style="stroke"
              strokeWidth={L.band * 0.9}
              color={C.brassLight}
              opacity={highlights[r]}
            />
          ))}

          {/* Spoke guides (fixed) */}
          {spokeLines.map((l, i) => (
            <Line key={`sp${i}`} p1={vec(l.a.x, l.a.y)} p2={vec(l.b.x, l.b.y)} strokeWidth={1.2} color={C.grooveDark} opacity={0.55} />
          ))}
          <Circle cx={L.cx} cy={L.cy - L.rim * 0.985} r={size * 0.012} color={C.brassDeep} />

          {/* Hint ring */}
          {hint && (
            <Group opacity={hintOpacity}>
              <Circle cx={L.cx} cy={L.cy} r={ringMid(L, hint.ring)} style="stroke" strokeWidth={L.band * 0.94} color={C.brassLight} opacity={0.55} />
              {hintArrow && <Path path={hintArrow} style="stroke" strokeWidth={3} strokeCap="round" color={C.brassDeep} />}
            </Group>
          )}

          {/* Rotating rings with their pins */}
          {Array.from({ length: Math.min(state.R, MAX_RINGS) }, (_, r) => (
            <Group key={`ring${r}`} origin={vec(L.cx, L.cy)} transform={transforms[r]}>
              <RingPins L={L} ring={r} cells={state.cells} offset={offsets[r]} symbols={symbols} locked={!!(state.locked & (1 << r))} />
            </Group>
          ))}

          {/* Gear markers (fixed) */}
          {gears.map((g, i) => (
            <Group key={`gear${i}`}>
              <Circle cx={L.cx} cy={L.cy} r={g.seam} style="stroke" strokeWidth={4} color={C.brass}>
                <DashPathEffect intervals={[6, 5]} />
              </Circle>
              {g.arrows.map((a, k) => (
                <Path key={k} path={a} color={C.brassDeep} opacity={0.9} />
              ))}
            </Group>
          ))}

          {/* Bursts */}
          {bursts.map(({ ev, t0: start }) =>
            ev.spokes.map((s) => <SpokeBurst key={`${ev.id}-${s.p}`} L={L} spoke={s} t0={start} clock={clock} />),
          )}

          {/* Hub */}
          <Circle cx={L.cx} cy={L.cy} r={L.hub * 0.92}>
            <RadialGradient c={vec(L.cx - L.hub * 0.3, L.cy - L.hub * 0.4)} r={L.hub * 1.4} colors={[C.brassLight, C.brass, C.brassDeep]} />
          </Circle>
          <Circle cx={L.cx} cy={L.cy} r={L.hub * 0.7} color={C.petrolDeep} />
          {hubFont && (
            <HubNumber font={hubFont} text={hubText} x={L.cx - hubTextWidth / 2} y={L.cy + L.hub * 0.29} warn={status === 'out'} />
          )}
        </Canvas>
      </View>
    </GestureDetector>
  );
}

function HubNumber({ font, text, x, y, warn }: { font: SkFont; text: string; x: number; y: number; warn: boolean }) {
  return <SkText x={x} y={y} text={text} font={font} color={warn ? C.danger : C.ivory} />;
}

/** Pins of one ring, drawn in ring-local slots (the parent Group applies the rotation). */
const RingPins = React.memo(function RingPins({
  L,
  ring,
  cells,
  offset,
  symbols,
  locked,
}: {
  L: BoardLayout;
  ring: number;
  cells: Int8Array;
  offset: number;
  symbols: boolean;
  locked: boolean;
}) {
  const items = useMemo(() => {
    const out: React.ReactNode[] = [];
    const rad = ringMid(L, ring);
    const pr = L.pinR;
    for (let i = 0; i < L.S; i++) {
      // Local slot i sits at absolute spoke i + offset.
      const v = cells[ring * L.S + mod(i + offset, L.S)];
      const { x, y } = polar(L, rad, slotAngle(L, i));
      const k = `${ring}-${i}`;
      if (v === EMPTY) {
        out.push(<Circle key={k} cx={x} cy={y} r={pr * 0.2} color={C.grooveDark} opacity={0.6} />);
      } else if (v === BOLT) {
        out.push(
          <Group key={k}>
            <Path path={hexPath(x, y + 1.2, pr * 0.95)} color={'#3E474E'} />
            <Path path={hexPath(x, y, pr * 0.92)} color={C.steel} />
            <Circle cx={x} cy={y} r={pr * 0.42} color={'#3E474E'} />
            <Circle cx={x} cy={y} r={pr * 0.24} color={C.steelLight} />
          </Group>,
        );
      } else if (v === WILD) {
        out.push(
          <Group key={k}>
            <Circle cx={x} cy={y + 1.2} r={pr} color={'#9C8E73'} />
            <Circle cx={x} cy={y} r={pr}>
              <SweepGradient c={vec(x, y)} colors={[...PIN_COLORS, PIN_COLORS[0]]} />
            </Circle>
            <Circle cx={x} cy={y} r={pr * 0.52} color={C.ivory} />
            <Path path={symbolPath(5, x, y, pr * 0.9)} color={C.brass} />
          </Group>,
        );
      } else {
        const c = colorOf(v);
        out.push(
          <Group key={k}>
            <Circle cx={x} cy={y + 1.4} r={pr} color={PIN_RIMS[c]} />
            <Circle cx={x} cy={y} r={pr} color={PIN_COLORS[c]} />
            <Circle cx={x} cy={y} r={pr * 0.62} color={'#FFFFFF'} opacity={0.16} />
            {symbols && <Path path={symbolPath(c, x, y, pr)} color={c === 2 ? C.ink : '#FFFFFF'} opacity={0.88} />}
            {isKey(v) && (
              <>
                <Circle cx={x} cy={y} r={pr * 0.62} color={C.ivory} />
                <Path path={keyPath(x, y, pr)} style="stroke" strokeWidth={Math.max(1.6, pr * 0.16)} strokeCap="round" color={C.brassDeep} />
              </>
            )}
          </Group>,
        );
      }
    }
    if (locked) {
      const { x, y } = polar(L, rad, slotAngle(L, 0) + L.step / 2);
      const [shackle, body] = padlockPaths(x, y, L.band * 0.42);
      out.push(
        <Group key={`lock${ring}`}>
          <Path path={shackle} style="stroke" strokeWidth={Math.max(2, L.band * 0.06)} color={C.ink} />
          <Path path={body} color={C.ink} />
        </Group>,
      );
    }
    return out;
  }, [L, ring, cells, offset, symbols, locked]);
  return <>{items}</>;
});

/** Pins popping outward with sparks, plus a flash along the unlocked spoke. */
function SpokeBurst({
  L,
  spoke,
  t0,
  clock,
}: {
  L: BoardLayout;
  spoke: UnlockEvent['spokes'][number];
  t0: number;
  clock: SharedValue<number>;
}) {
  const color = spoke.color >= 0 ? PIN_COLORS[spoke.color] : C.brassLight;
  const ang = slotAngle(L, spoke.p);
  const centers = useMemo(() => Array.from({ length: L.R }, (_, r) => polar(L, ringMid(L, r), ang)), [L, ang]);
  const flashA = polar(L, L.hub, ang);
  const flashB = polar(L, L.rim * 0.96, ang);
  const pr = L.pinR;
  const progress = useDerivedValue(() => {
    const k = (clock.value - t0) / 700;
    return k < 0 ? 0 : k > 1 ? 1 : k;
  });
  const fade = useDerivedValue(() => 0.7 * (1 - progress.value) * (1 - progress.value));
  const flashOpacity = useDerivedValue(() => Math.max(0, 1 - progress.value * 1.8) * 0.9);
  const ghosts = useDerivedValue(() => {
    const e = 1 - Math.pow(1 - progress.value, 3);
    const path = Skia.PathBuilder.Make();
    for (const c of centers) path.addCircle(c.x, c.y, pr * (1 + 0.45 * e));
    return path.build();
  });
  const sparks = useDerivedValue(() => {
    const k = progress.value;
    const e = 1 - Math.pow(1 - k, 3);
    const path = Skia.PathBuilder.Make();
    for (let r = 0; r < centers.length; r++) {
      const c = centers[r];
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2 + r * 0.7;
        const dist = pr * (0.7 + 2.2 * e);
        path.addCircle(c.x + Math.cos(a) * dist, c.y + Math.sin(a) * dist, Math.max(0.1, pr * 0.2 * (1 - k)));
      }
    }
    return path.build();
  });
  return (
    <Group>
      <Line p1={vec(flashA.x, flashA.y)} p2={vec(flashB.x, flashB.y)} strokeWidth={L.band * 0.55} strokeCap="round" color={C.brassLight} opacity={flashOpacity} />
      <Path path={ghosts} color={color} opacity={fade} />
      <Path path={sparks} color={color} />
    </Group>
  );
}
