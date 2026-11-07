import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Board } from '../game/Board';
import { useRush } from '../game/useRush';
import { Celebration, celebrationLength, coinArrival, type CelebrationSpec } from '../game/Celebration';
import { C, F, SPACE } from '../theme';
import { Button, Coins, Sheet, Txt, bannerEnter } from '../ui/kit';
import { RewardSheet } from '../ui/rewards';
import { buzz, notchFeedback, play, type Sfx } from '../feedback';
import { getProgress, grantRewards, markIntroSeen, recordBonus, useProgress } from '../state/store';
import { useSkin, type PinSkin, type Skin } from '../skins';
import { useStrings } from '../useStrings';

const GOLD_RIM = '#9A6B12';

export function RushScreen({ level, onDone, onShop }: { level: number; onDone: () => void; onShop?: () => void }) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const rush = useRush(level);
  const base = useSkin();
  const [showIntro, setShowIntro] = useState(!p.seenIntros.includes('rush'));
  const [banked, setBanked] = useState<{ coins: number; best: boolean } | null>(null);
  const [celebration, setCelebration] = useState<CelebrationSpec | null>(null);
  const [coinLag, setCoinLag] = useState(0);
  const [lap, setLap] = useState(0);
  const [payShown, setPayShown] = useState<{ id: number; coins: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const boardRef = useRef<React.ComponentRef<typeof View>>(null);
  const coinsRef = useRef<React.ComponentRef<typeof View>>(null);

  // Gold rush look: the player's dial and pin colours, with gold rims and candy gloss.
  const skin = useMemo<Skin>(() => {
    const pins: PinSkin = { ...base.pins, rims: base.pins.colors.map(() => GOLD_RIM), shine: 'gloss' };
    return { ...base, pins, dial: { ...base.dial, rim: ['#FFE08A', '#E0A623', '#8C5F0C'], accentLight: '#FFE08A' } };
  }, [base]);

  // Payout: bell by combo size, a ching per pay, haptic.
  useEffect(() => {
    if (!rush.pay) return;
    const n = rush.pay.spokes;
    play(n >= 3 ? 'combo3' : n === 2 ? 'combo2' : 'unlock');
    buzz.unlock(n);
    setPayShown({ id: rush.pay.id, coins: rush.pay.coins });
    const t = setTimeout(() => play(n >= 3 ? 'coin4' : n === 2 ? 'coin3' : 'coin2'), 160);
    const hide = setTimeout(() => setPayShown(null), 1000);
    return () => {
      clearTimeout(t);
      clearTimeout(hide);
    };
  }, [rush.pay]);

  // Rush over: bank the haul, coins fly into the counter, then the summary.
  useEffect(() => {
    if (rush.status !== 'won' || banked) return;
    const coins = rush.haul;
    const best = coins > getProgress().bonus.bestRush;
    setCoinLag(coins);
    if (coins > 0) grantRewards([{ kind: 'coins', n: coins }]);
    recordBonus('rush', coins);
    setLap((n) => n + 1);
    play('ratchet');
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    at(400, () => {
      play('win');
      buzz.win();
      if (coins >= 100) play('jackpot');
      const sprites = coins > 0 ? Math.min(6, Math.max(3, Math.round(coins / 20))) : 0;
      if (reduceMotion || sprites === 0) {
        setCoinLag(0);
        return;
      }
      measure((origin, target, w, h) => {
        setCelebration({ id: Date.now(), tier: 'vault', coins: sprites, origin, target, width: w, height: h });
        for (let i = 0; i < sprites; i++) {
          const share = Math.floor(coins / sprites) + (i < coins % sprites ? 1 : 0);
          at(coinArrival(i) * 1000, () => {
            play(`coin${Math.min(i, 3) + 1}` as Sfx);
            setCoinLag((l) => Math.max(0, l - share));
          });
        }
        at(celebrationLength('vault', sprites) * 1000, () => setCelebration(null));
      });
    });
    at(reduceMotion ? 600 : 2600, () => {
      setCoinLag(0);
      setBanked({ coins, best });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rush.status]);

  const measure = (cb: (o: { x: number; y: number; r: number }, t: { x: number; y: number }, w: number, h: number) => void) => {
    const root = rootRef.current;
    const board = boardRef.current;
    const coinsBox = coinsRef.current;
    if (!root || !board) return;
    root.measureInWindow((rx, ry, rw, rh) =>
      board.measureInWindow((bx, by, bw, bh) => {
        const o = { x: bx - rx + bw / 2, y: by - ry + bh / 2, r: (Math.min(bw, bh) / 2) * 0.96 };
        if (!coinsBox) return cb(o, { x: rw - 40, y: 30 }, rw, rh);
        coinsBox.measureInWindow((cx, cy, cw, ch) => cb(o, { x: cx - rx + Math.min(cw, ch) / 2 + 6, y: cy - ry + ch / 2 }, rw, rh));
      }),
    );
  };

  const boardSize = Math.min(width - SPACE.l * 2, height - insets.top - insets.bottom - 260, width >= 700 ? 680 : 520);

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
            {s.rushTitle}
          </Txt>
        </View>
        <Pressable onPress={onDone} accessibilityRole="button" hitSlop={12} style={styles.skip}>
          <Text style={styles.skipText}>{rush.status === 'won' ? '' : s.skip}</Text>
        </Pressable>
      </View>

      <View style={styles.haul} accessibilityLiveRegion="polite">
        <MaterialCommunityIcons name="circle-multiple" size={26} color={C.brassLight} />
        <Text style={styles.haulText}>{rush.haul}</Text>
      </View>
      <Text style={styles.turns}>{s.rushTurns(rush.turnsLeft)}</Text>

      <View style={styles.boardWrap}>
        <View ref={boardRef} collapsable={false}>
          <Board
            game={rush}
            size={boardSize}
            symbols={p.settings.symbols}
            hubValue={rush.turnsLeft}
            onNotch={notchFeedback}
            onDeny={() => undefined}
            skin={skin}
            celebrate={lap}
          />
        </View>
        {payShown && (
          <Animated.View key={payShown.id} entering={bannerEnter} exiting={FadeOut.duration(250)} style={styles.pay} pointerEvents="none">
            <Text style={styles.payText}>+{payShown.coins}</Text>
          </Animated.View>
        )}
      </View>

      {celebration && <Celebration spec={celebration} />}

      <Sheet
        visible={showIntro}
        onClose={() => {
          setShowIntro(false);
          markIntroSeen('rush');
        }}
      >
        <View style={{ gap: SPACE.m }}>
          <MaterialCommunityIcons name="star-four-points" size={44} color={C.brassLight} style={{ alignSelf: 'center' }} />
          <Txt variant="title">{s.rushIntroTitle}</Txt>
          <Txt variant="body">{s.rushIntroBody}</Txt>
          <Button
            label={s.ok}
            onPress={() => {
              setShowIntro(false);
              markIntroSeen('rush');
            }}
          />
        </View>
      </Sheet>

      <RewardSheet
        visible={!!banked}
        title={s.rushOver}
        icon="treasure-chest"
        rewards={banked && banked.coins > 0 ? [{ kind: 'coins', n: banked.coins }] : []}
        extra={
          banked ? (
            <Txt variant="small" center>
              {banked.best ? s.rushNewBest : s.rushBest(p.bonus.bestRush)}
            </Txt>
          ) : null
        }
        onCollect={onDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.petrol },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, minHeight: 52 },
  skip: { minWidth: 64, alignItems: 'flex-end', paddingVertical: SPACE.s },
  skipText: { fontFamily: F.uiSemi, fontSize: 15, color: C.ivoryDim },
  haul: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, marginTop: SPACE.m },
  haulText: { fontFamily: F.display, fontSize: 40, color: C.brassLight, fontVariant: ['tabular-nums'] },
  turns: { fontFamily: F.uiSemi, fontSize: 15, color: C.ivoryDim, textAlign: 'center' },
  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pay: { position: 'absolute', top: '6%', alignSelf: 'center' },
  payText: {
    fontFamily: F.display,
    fontSize: 34,
    color: C.brassLight,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
});
