import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  RoundedRect,
  Skia,
  Text as SkText,
  useFont,
  vec,
} from '@shopify/react-native-skia';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, SPACE } from '../theme';
import { Button, Coins, Sheet, Txt } from '../ui/kit';
import { rewardIcon, useRewardLabel } from '../ui/rewards';
import { buzz, play, type Sfx } from '../feedback';
import { grantRewards, markIntroSeen, recordBonus, useProgress, type Reward } from '../state/store';
import { useStrings } from '../useStrings';
import { SAFE_DIRS, SAFE_NUMBERS, SAFE_STEP, makeCombo, safeRewards, safeTier, type SafeTier } from '../game/safe';
import { Celebration, celebrationLength, coinArrival, type CelebrationSpec } from '../game/Celebration';

const CATCH = 0.62; // same detent hysteresis as the game board
/** Prize tiles inside the open safe: first one this long after the door starts opening, then one per step. */
const PRIZE_DELAY = 700;
const PRIZE_STEP = 260;

export function SafecrackerScreen({ level, onDone, onShop }: { level: number; onDone: () => void; onShop?: () => void }) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const combo = useMemo(() => makeCombo(level), [level]);
  const [step, setStep] = useState(0);
  const [misses, setMisses] = useState(0);
  const [showIntro, setShowIntro] = useState(!p.seenIntros.includes('safe'));
  const [opened, setOpened] = useState(false);
  const [result, setResult] = useState<{ tier: SafeTier; rewards: Reward[]; cracked: number } | null>(null);
  /** Prizes shown inside the open safe (set as the door opens). */
  const [prizes, setPrizes] = useState<{ tier: SafeTier; rewards: Reward[] } | null>(null);
  const rewardLabel = useRewardLabel();
  const [celebration, setCelebration] = useState<CelebrationSpec | null>(null);
  const [coinLag, setCoinLag] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const doorRef = useRef<React.ComponentRef<typeof View>>(null);
  /** The safe's opening: celebrations start from here (the door itself folds away). */
  const insideRef = useRef<React.ComponentRef<typeof View>>(null);
  const coinsRef = useRef<React.ComponentRef<typeof View>>(null);

  const size = Math.max(240, Math.min(width - SPACE.xl * 2, height - insets.top - insets.bottom - 330, 380));
  const c = size / 2;
  const R = size * 0.4;
  const font = useFont(require('@expo-google-fonts/figtree/700Bold/Figtree_700Bold.ttf'), R * 0.15);

  // --- dial state (UI thread) ---------------------------------------------
  const angle = useSharedValue(0);
  const lastAngle = useSharedValue(0);
  const active = useSharedValue(false);
  const lastIdx = useSharedValue(0);
  const lastDir = useSharedValue(0);
  const moved = useSharedValue(false);
  const target = useSharedValue(combo[0]);
  const needDir = useSharedValue<number>(SAFE_DIRS[0]);
  const frozen = useSharedValue(true);
  const lamp = useSharedValue(0);
  const tremble = useSharedValue(0);
  const door = useSharedValue(0);

  useEffect(() => {
    target.value = combo[Math.min(step, 2)];
    needDir.value = SAFE_DIRS[Math.min(step, 2)];
  }, [step, combo, target, needDir]);
  useEffect(() => {
    frozen.value = showIntro || step >= 3;
  }, [showIntro, step, frozen]);

  // --- feedback and rules (JS thread) ---------------------------------------
  const lastTickAt = useRef(0);
  const jsTick = useCallback(() => {
    const now = Date.now();
    if (now - lastTickAt.current < 28) return;
    lastTickAt.current = now;
    play('notch', 0.35);
    buzz.notch();
  }, []);
  const jsCatch = useCallback(() => {
    play('tumbler');
    buzz.tumbler();
    lamp.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 700 }));
    tremble.value = withSequence(withTiming(1, { duration: 35 }), withTiming(-1, { duration: 60 }), withTiming(0, { duration: 80 }));
  }, [lamp, tremble]);

  const stepRef = useRef(step);
  stepRef.current = step;

  const openSafe = useCallback(
    (missCount: number) => {
      const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
      const tier = safeTier(missCount);
      const cracked = p.bonus.safes;
      const rewards = safeRewards(tier, cracked);
      const coins = rewards.reduce((n, r) => n + (r.kind === 'coins' ? r.n : 0), 0);
      at(350, () => {
        play('safeopen');
        buzz.win();
        door.value = withTiming(1, { duration: reduceMotion ? 0 : 800, easing: Easing.inOut(Easing.cubic) });
        setOpened(true);
        setPrizes({ tier, rewards });
      });
      // Each prize tile lands with its own sound (delays match PRIZE_DELAY / PRIZE_STEP below).
      rewards.forEach((r, i) =>
        at(350 + PRIZE_DELAY + i * PRIZE_STEP, () => {
          play(r.kind === 'coins' ? 'coin4' : r.kind === 'goldenKey' ? 'sparkle' : 'key');
          buzz.notch();
        }),
      );
      at(1200, () => {
        setCoinLag(coins);
        grantRewards(rewards);
        recordBonus('safe');
        play('win');
        if (tier === 'gold') play('jackpot');
        if (!reduceMotion) startCelebration(tier, Math.min(6, Math.max(3, Math.round(coins / 25))), coins);
        else setCoinLag(0);
      });
      at(reduceMotion ? 1400 : 350 + PRIZE_DELAY + rewards.length * PRIZE_STEP + 700, () => {
        setCoinLag(0);
        setResult({ tier, rewards, cracked: cracked + 1 });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.bonus.safes, reduceMotion],
  );

  const missesRef = useRef(0);
  const jsRelease = useCallback(
    (num: number, dir: number, didMove: boolean) => {
      if (!didMove || stepRef.current >= 3) return;
      const st = stepRef.current;
      if (num === combo[st] && dir === SAFE_DIRS[st]) {
        play('unlock');
        buzz.unlock(1);
        const next = st + 1;
        setStep(next);
        if (next === 3) openSafe(missesRef.current);
      } else {
        missesRef.current += 1;
        setMisses(missesRef.current);
      }
    },
    [combo, openSafe],
  );

  const startCelebration = (tier: SafeTier, sprites: number, coins: number) => {
    const root = rootRef.current;
    const box = insideRef.current;
    const coinsBox = coinsRef.current;
    if (!root || !box) return;
    root.measureInWindow((rx, ry, rw, rh) =>
      box.measureInWindow((bx, by, bw, bh) => {
        const go = (tx: number, ty: number) => {
          setCelebration({
            id: Date.now(),
            tier: tier === 'gold' ? 'vault' : tier === 'silver' ? 'perfect' : 'normal',
            coins: sprites,
            origin: { x: bx - rx + bw / 2, y: by - ry + bh / 2, r: bw * 0.4 },
            target: { x: tx, y: ty },
            width: rw,
            height: rh,
          });
          for (let i = 0; i < sprites; i++) {
            const share = Math.floor(coins / sprites) + (i < coins % sprites ? 1 : 0);
            timers.current.push(
              setTimeout(
                () => {
                  play(`coin${Math.min(i, 3) + 1}` as Sfx);
                  setCoinLag((l) => Math.max(0, l - share));
                },
                coinArrival(i) * 1000,
              ),
            );
          }
          timers.current.push(setTimeout(() => setCelebration(null), celebrationLength('vault', sprites) * 1000));
        };
        if (!coinsBox) return go(rw - 40, 30);
        coinsBox.measureInWindow((cx2, cy2, cw, ch) => go(cx2 - rx + Math.min(cw, ch) / 2 + 6, cy2 - ry + ch / 2));
      }),
    );
  };

  // --- gesture --------------------------------------------------------------
  const pan = usePanGesture({
    minDistance: 1,
    onBegin: (e) => {
      'worklet';
      if (frozen.value) return;
      const dx = e.x - c;
      const dy = e.y - c;
      if (Math.sqrt(dx * dx + dy * dy) > c) return;
      active.value = true;
      moved.value = false;
      lastAngle.value = Math.atan2(dy, dx);
    },
    onUpdate: (e) => {
      'worklet';
      if (!active.value) return;
      const ang = Math.atan2(e.y - c, e.x - c);
      let d = ang - lastAngle.value;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      lastAngle.value = ang;
      angle.value += d;
      const pos = -angle.value / SAFE_STEP;
      const last = lastIdx.value;
      if (pos > last + CATCH || pos < last - CATCH) {
        const n = Math.round(pos);
        if (n !== last) {
          const dir = n < last ? 1 : -1; // numbers count down when turning clockwise
          const inc = n > last ? 1 : -1;
          for (let k = last + inc; ; k += inc) {
            const num = ((k % SAFE_NUMBERS) + SAFE_NUMBERS) % SAFE_NUMBERS;
            if (num === target.value && dir === needDir.value) scheduleOnRN(jsCatch);
            else scheduleOnRN(jsTick);
            if (k === n) break;
          }
          lastIdx.value = n;
          lastDir.value = dir;
          moved.value = true;
        }
      }
    },
    onFinalize: () => {
      'worklet';
      if (!active.value) return;
      active.value = false;
      const n = Math.round(-angle.value / SAFE_STEP);
      angle.value = withTiming(-n * SAFE_STEP, { duration: 110, easing: Easing.out(Easing.cubic) });
      lastIdx.value = n;
      const num = ((n % SAFE_NUMBERS) + SAFE_NUMBERS) % SAFE_NUMBERS;
      scheduleOnRN(jsRelease, num, lastDir.value, moved.value);
    },
  });

  // --- drawing --------------------------------------------------------------
  const ticks = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    for (let i = 0; i < SAFE_NUMBERS; i++) {
      const a = -Math.PI / 2 + i * SAFE_STEP;
      const r0 = R * (i % 5 === 0 ? 0.76 : 0.83);
      pb.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      pb.lineTo(c + Math.cos(a) * R * 0.9, c + Math.sin(a) * R * 0.9);
    }
    return pb.build();
  }, [R, c]);
  const grip = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pb.addCircle(c + Math.cos(a) * R * 0.4, c + Math.sin(a) * R * 0.4, R * 0.045);
    }
    return pb.build();
  }, [R, c]);
  const marker = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    const y = c - R * 1.02;
    pb.moveTo(c - R * 0.07, y - R * 0.1);
    pb.lineTo(c + R * 0.07, y - R * 0.1);
    pb.lineTo(c, y + R * 0.03);
    pb.close();
    return pb.build();
  }, [R, c]);
  const labels = useMemo(
    () =>
      font
        ? Array.from({ length: SAFE_NUMBERS / 5 }, (_, i) => {
            const n = i * 5;
            const a = -Math.PI / 2 + n * SAFE_STEP;
            const t = String(n);
            const w = font.getTextWidth(t);
            return { t, x: c + Math.cos(a) * R * 0.62 - w / 2, y: c + Math.sin(a) * R * 0.62 + R * 0.055 };
          })
        : [],
    [font, R, c],
  );

  const dialT = useDerivedValue(() => [{ rotate: angle.value }]);
  const markerT = useDerivedValue(() => [{ rotate: tremble.value * 0.06 }]);
  const lampOpacity = useDerivedValue(() => 0.25 + lamp.value * 0.75);
  const lampGlow = useDerivedValue(() => lamp.value * 0.6);
  const doorStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - 0.9 * door.value }],
  }));
  const doorShade = useAnimatedStyle(() => ({ opacity: door.value * 0.55 }));

  const dirNow = SAFE_DIRS[Math.min(step, 2)];

  return (
    <View ref={rootRef} collapsable={false} style={[styles.root, { paddingTop: insets.top + SPACE.s, paddingBottom: insets.bottom + SPACE.m }]}>
      <View style={styles.header}>
        <View ref={coinsRef} collapsable={false}>
          <Coins value={p.coins - coinLag} onPress={onShop} />
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="tiny" color={C.brassLight}>
            {s.bonus}
          </Txt>
          <Txt variant="heading" style={{ fontFamily: F.display, fontSize: 19 }}>
            {s.safeTitle}
          </Txt>
        </View>
        <Pressable onPress={opened ? undefined : onDone} accessibilityRole="button" hitSlop={12} style={styles.skip}>
          <Text style={styles.skipText}>{opened ? '' : s.skip}</Text>
        </Pressable>
      </View>

      <View style={styles.tumblers} accessibilityLabel={`${step} / 3`}>
        {[0, 1, 2].map((i) => {
          const done = i < step;
          const now = i === step;
          return (
            <View key={i} style={[styles.tumbler, done && styles.tumblerDone, now && styles.tumblerNow]}>
              <MaterialCommunityIcons
                name={done ? 'check-bold' : SAFE_DIRS[i] === 1 ? 'rotate-right' : 'rotate-left'}
                size={22}
                color={done ? C.ink : now ? C.brassLight : C.ivoryDim}
              />
            </View>
          );
        })}
      </View>
      <Text style={styles.direction}>{step < 3 ? (dirNow === 1 ? s.turnRight : s.turnLeft) : prizes ? s.tierName(prizes.tier) : s.safeOpened}</Text>

      <View style={styles.stage}>
        <View ref={insideRef} collapsable={false} style={[styles.interior, { width: size, height: size }]}>
          {prizes ? (
            <View style={styles.prizes}>
              <Animated.View entering={FadeIn.delay(PRIZE_DELAY - 250).duration(300)}>
                <MaterialCommunityIcons name="treasure-chest" size={size * 0.2} color={C.brassLight} />
              </Animated.View>
              {prizes.rewards.map((r, i) => {
                const gold = r.kind === 'goldenKey';
                return (
                  <Animated.View
                    key={`${r.kind}${i}`}
                    entering={FadeInDown.delay(PRIZE_DELAY + i * PRIZE_STEP).duration(300)}
                    style={[styles.prize, gold && styles.prizeGold]}
                  >
                    <MaterialCommunityIcons name={rewardIcon(r)} size={26} color={gold ? C.ink : C.brassLight} />
                    <Text style={[styles.prizeText, gold && { color: C.ink }]}>{rewardLabel(r)}</Text>
                  </Animated.View>
                );
              })}
            </View>
          ) : (
            <MaterialCommunityIcons name="treasure-chest" size={size * 0.36} color={C.brassLight} />
          )}
        </View>
        <Animated.View
          ref={doorRef}
          collapsable={false}
          pointerEvents={opened ? 'none' : 'auto'}
          style={[{ width: size, height: size, transformOrigin: 'left center' }, doorStyle]}
        >
          <GestureDetector gesture={pan}>
            <View style={{ width: size, height: size }}>
              <Canvas style={{ width: size, height: size }}>
                {/* Door plate with rivets */}
                <RoundedRect x={2} y={2} width={size - 4} height={size - 4} r={size * 0.08}>
                  <LinearGradient start={vec(0, 0)} end={vec(size, size)} colors={['#9AA6AE', '#6B7780', '#3F4A52']} />
                </RoundedRect>
                <RoundedRect
                  x={size * 0.04}
                  y={size * 0.04}
                  width={size * 0.92}
                  height={size * 0.92}
                  r={size * 0.06}
                  style="stroke"
                  strokeWidth={2}
                  color="#2E363C"
                  opacity={0.6}
                />
                {[
                  [0.09, 0.09],
                  [0.91, 0.09],
                  [0.09, 0.91],
                  [0.91, 0.91],
                ].map(([x, y], i) => (
                  <Group key={i}>
                    <Circle cx={size * x} cy={size * y + 1} r={size * 0.018} color="#2B3237" />
                    <Circle cx={size * x} cy={size * y} r={size * 0.018} color="#B9C3CA" />
                  </Group>
                ))}
                {/* Dial */}
                <Circle cx={c} cy={c} r={R * 1.04}>
                  <RadialGradient c={vec(c, c - R * 0.4)} r={R * 1.3} colors={[C.brassLight, C.brass, C.brassDeep]} />
                </Circle>
                <Group origin={vec(c, c)} transform={dialT}>
                  <Circle cx={c} cy={c} r={R * 0.96} color="#1B2126" />
                  <Path path={ticks} style="stroke" strokeWidth={Math.max(1.4, R * 0.012)} color={C.ivory} />
                  {font && labels.map((l) => <SkText key={l.t} x={l.x} y={l.y} text={l.t} font={font} color={C.ivory} />)}
                  <Circle cx={c} cy={c} r={R * 0.46}>
                    <RadialGradient c={vec(c - R * 0.12, c - R * 0.16)} r={R * 0.6} colors={['#5C6870', '#2E363C', '#14181B']} />
                  </Circle>
                  <Path path={grip} color="#0E1113" opacity={0.7} />
                  <Circle cx={c} cy={c} r={R * 0.14}>
                    <RadialGradient c={vec(c - R * 0.04, c - R * 0.05)} r={R * 0.2} colors={[C.brassLight, C.brass, C.brassDeep]} />
                  </Circle>
                </Group>
                {/* Fixed marker and the catch lamp */}
                <Group origin={vec(c, c - R * 1.02)} transform={markerT}>
                  <Path path={marker} color={C.danger} />
                </Group>
                <Circle cx={c} cy={c - R * 1.22} r={R * 0.16} color="#FFE7A3" opacity={lampGlow} />
                <Circle cx={c} cy={c - R * 1.22} r={R * 0.065} color="#FFD45A" opacity={lampOpacity} />
              </Canvas>
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.doorShade, doorShade]} />
            </View>
          </GestureDetector>
        </Animated.View>
      </View>

      {result ? (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.footer}>
          <Text style={styles.misses}>
            {s.misses(misses)}. {s.safesToKey(3 - (result.cracked % 3))}
          </Text>
          <Button label={s.collect} onPress={onDone} style={{ alignSelf: 'stretch' }} />
        </Animated.View>
      ) : (
        <View style={styles.footer}>
          <Text style={styles.hint}>{step < 3 ? s.safeHint : ' '}</Text>
          <Text style={styles.misses}>{s.misses(misses)}</Text>
        </View>
      )}

      {celebration && <Celebration spec={celebration} />}

      <Sheet
        visible={showIntro}
        onClose={() => {
          setShowIntro(false);
          markIntroSeen('safe');
        }}
      >
        <View style={{ gap: SPACE.m }}>
          <MaterialCommunityIcons name="safe" size={46} color={C.brassLight} style={{ alignSelf: 'center' }} />
          <Txt variant="title">{s.safeIntroTitle}</Txt>
          <Txt variant="body">{s.safeIntroBody}</Txt>
          <Button
            label={s.ok}
            onPress={() => {
              setShowIntro(false);
              markIntroSeen('safe');
            }}
          />
        </View>
      </Sheet>

      {opened && !result && <Pressable style={StyleSheet.absoluteFill} accessible={false} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.petrol },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, minHeight: 52 },
  skip: { minWidth: 64, alignItems: 'flex-end', paddingVertical: SPACE.s },
  skipText: { fontFamily: F.uiSemi, fontSize: 15, color: C.ivoryDim },
  tumblers: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.l, marginTop: SPACE.l },
  tumbler: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: C.petrolLine,
    backgroundColor: C.petrolDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tumblerNow: { borderColor: C.brassLight, borderWidth: 3 },
  tumblerDone: { backgroundColor: C.brass, borderColor: C.brass },
  direction: { fontFamily: F.display, fontSize: 18, color: C.ivory, textAlign: 'center', marginTop: SPACE.m },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  interior: {
    position: 'absolute',
    borderRadius: 24,
    backgroundColor: '#0B1114',
    borderWidth: 3,
    borderColor: '#2E363C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { alignItems: 'center', gap: SPACE.s, paddingHorizontal: SPACE.xl, minHeight: 96, justifyContent: 'center' },
  doorShade: { backgroundColor: '#000', borderRadius: 24 },
  prizes: { alignItems: 'center', gap: SPACE.s, alignSelf: 'stretch', paddingHorizontal: '16%' },
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.m,
    alignSelf: 'stretch',
    backgroundColor: C.petrolDeep,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.brass,
    paddingVertical: SPACE.s,
    paddingHorizontal: SPACE.m,
  },
  prizeGold: { backgroundColor: C.brassLight, borderColor: C.brassDeep },
  prizeText: { fontFamily: F.uiBold, fontSize: 18, color: C.ivory },
  hint: { fontFamily: F.uiSemi, fontSize: 15, color: C.ivory, textAlign: 'center' },
  misses: { fontFamily: F.ui, fontSize: 13, color: C.ivoryDim, textAlign: 'center', marginTop: 4 },
});
