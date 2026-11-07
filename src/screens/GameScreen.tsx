import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Board, HUB_POP_MS } from '../game/Board';
import { Celebration, celebrationLength, coinArrival, type CelebrationSpec, type CelebrationTier } from '../game/Celebration';
import { useGame } from '../game/useGame';
import type { LevelDef } from '../engine/types';
import { colorOf, cellAt, WILD, EMPTY, BOLT } from '../engine';
import { C, F, PIN_NAMES_EN, PIN_NAMES_FR, SPACE } from '../theme';
import { Button, Coins, IconButton, Sheet, StampStars, Toast, Txt, bannerEnter } from '../ui/kit';
import { buzz, notchFeedback, play, type Sfx } from '../feedback';
import {
  coinsFor,
  liveStreak,
  markIntroSeen,
  PRICES,
  recordDaily,
  recordLevelWin,
  spendCoins,
  starsFor,
  addCoins,
  update,
  consumeBooster,
  useProgress,
} from '../state/store';
import { useLang, useStrings } from '../useStrings';
import { VAULT_SKINS, grantSkin, skinById, useSkin } from '../skins';
import { adsAvailable, maybeShowInterstitial, showRewarded } from '../services/ads';
import { LINKS } from '../services/config';
import { track } from '../services/analytics';

export type GameMode = { kind: 'campaign'; index: number } | { kind: 'daily'; date: string };

interface Props {
  def: LevelDef;
  mode: GameMode;
  onBack: () => void;
  /** firstClear: the level had never been won before (bonus rounds only follow a first clear). */
  onNext?: (opts: { firstClear: boolean }) => void;
  onShop?: () => void;
}

export function GameScreen({ def, mode, onBack, onNext, onShop }: Props) {
  const s = useStrings();
  const progress = useProgress();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const game = useGame(def);
  const [showIntro, setShowIntro] = useState(!!def.intro && !progress.seenIntros.includes(def.intro));
  const [winOpen, setWinOpen] = useState(false);
  const [reward, setReward] = useState<{
    stars: number;
    coins: number;
    streak?: number;
    doubled?: boolean;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [combo, setCombo] = useState<{ id: number; n: number } | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  const recorded = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const skin = useSkin();
  const lang = useLang();
  const [wonSkin, setWonSkin] = useState<string | null>(null);
  // Celebration: board victory lap id, overlay spec, coins not yet "landed" in the counter.
  const [lap, setLap] = useState(0);
  const [celebration, setCelebration] = useState<CelebrationSpec | null>(null);
  const [coinLag, setCoinLag] = useState(0);
  const celebTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const boardRef = useRef<React.ComponentRef<typeof View>>(null);
  const coinsRef = useRef<React.ComponentRef<typeof View>>(null);

  const isDaily = mode.kind === 'daily';
  const levelNumber = mode.kind === 'campaign' ? mode.index + 1 : 0;
  const isVault = levelNumber > 0 && levelNumber % 10 === 0;

  const flash = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setScreenReader)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    track('level_start', { id: def.id });
  }, [def.id]);

  // Sound, haptics and combo banner for each unlock.
  useEffect(() => {
    const ev = game.event;
    if (!ev) return;
    const n = ev.spokes.length;
    if (n >= 3) play('combo3');
    else if (n === 2) play('combo2');
    else if (n === 1) play('unlock');
    if (n) buzz.unlock(n);
    if (ev.unlocked.length) setTimeout(() => play('key'), 220);
    if (n >= 2) setCombo({ id: ev.id, n });
    if (screenReader && n) AccessibilityInfo.announceForAccessibility(n >= 2 ? s.combo(n) : s.cleared);
  }, [game.event, s, screenReader]);

  useEffect(() => {
    if (!combo) return;
    const t = setTimeout(() => setCombo(null), 1100);
    return () => clearTimeout(t);
  }, [combo]);

  const clearCelebration = useCallback(() => {
    celebTimers.current.forEach(clearTimeout);
    celebTimers.current = [];
  }, []);
  useEffect(() => clearCelebration, [clearCelebration]);

  /** Result card, with the stars stamping in do - mi - sol (delays match StampStars). */
  const openResult = useCallback((stars: number, stopFx = false) => {
    if (stopFx) setCelebration(null);
    setCoinLag(0);
    setWinOpen(true);
    for (let i = 0; i < stars; i++) {
      celebTimers.current.push(
        setTimeout(
          () => {
            play(`star${i + 1}` as Sfx);
            buzz.tap();
          },
          300 + i * 200,
        ),
      );
    }
  }, []);

  // Win: record once, then the celebration (see Celebration.tsx for the visuals):
  //   +0.30 s  rings spin a victory lap, ratchet
  //   +0.70 s  hub pops: rays, confetti, fanfare (+ shower / coin fountain by tier)
  //   then     coins arc into the counter, one rising "ching" each
  //   end      result card slides up. Tapping anywhere skips to the card.
  useEffect(() => {
    if (game.status !== 'won' || recorded.current) return;
    recorded.current = true;
    let res: { stars: number; coins: number; streak?: number };
    if (mode.kind === 'campaign') {
      const rec = recordLevelWin(mode.index, def.id, game.turns, def.par);
      firstClear.current = rec.first;
      res = rec;
      // Each vault opens a Lockbox style, in a fixed order.
      const vaultSkin = isVault ? VAULT_SKINS[levelNumber / 10 - 1] : undefined;
      if (vaultSkin && grantSkin(vaultSkin)) setWonSkin(vaultSkin);
    } else {
      const r = recordDaily(mode.date, {
        turns: game.turns,
        par: def.par,
        won: true,
        clears: game.clears,
      });
      res = {
        stars: starsFor(game.turns, def.par),
        coins: r.coins,
        streak: r.streak,
      };
    }
    track('level_win', { id: def.id, turns: game.turns, par: def.par });
    setReward(res);
    clearCelebration();
    const at = (ms: number, fn: () => void) => celebTimers.current.push(setTimeout(fn, ms));

    if (reduceMotion) {
      at(450, () => {
        play('win');
        buzz.win();
        openResult(res.stars);
      });
      return;
    }

    const tier: CelebrationTier = isVault ? 'vault' : res.stars === 3 ? 'perfect' : 'normal';
    const sprites = res.coins > 0 ? Math.min(6, Math.max(3, Math.round(res.coins / 5))) : 0;
    setCoinLag(res.coins);
    const LAP = 300;
    const POP = LAP + HUB_POP_MS;

    at(LAP, () => {
      setLap((n) => n + 1);
      play('ratchet');
    });
    at(POP, () => {
      play('win');
      buzz.win();
      if (tier === 'vault') play('jackpot');
      measureCelebration(tier, sprites);
    });
    if (tier === 'perfect') at(POP + 180, () => play('sparkle'));
    // Coins land: rising chings, the counter catches up coin by coin.
    for (let i = 0; i < sprites; i++) {
      const share = Math.floor(res.coins / sprites) + (i < res.coins % sprites ? 1 : 0);
      at(POP + coinArrival(i) * 1000, () => {
        play(`coin${Math.min(i, 3) + 1}` as Sfx);
        buzz.notch();
        setCoinLag((l) => Math.max(0, l - share));
      });
    }
    const end = POP + Math.min(celebrationLength(tier, sprites), sprites ? coinArrival(sprites - 1) + 0.35 : 1.3) * 1000;
    at(end, () => openResult(res.stars));
    at(POP + celebrationLength(tier, sprites) * 1000, () => setCelebration(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status, game.turns, game.clears, def, mode]);

  /** Board centre and coin counter position, relative to the screen root, then start the overlay. */
  const measureCelebration = (tier: CelebrationTier, sprites: number) => {
    const root = rootRef.current;
    const board = boardRef.current;
    const coins = coinsRef.current;
    if (!root || !board) return;
    root.measureInWindow((rx, ry, rw, rh) => {
      board.measureInWindow((bx, by, bw, bh) => {
        const go = (tx: number, ty: number) =>
          setCelebration({
            id: Date.now(),
            tier,
            coins: sprites,
            origin: {
              x: bx - rx + bw / 2,
              y: by - ry + bh / 2,
              r: (Math.min(bw, bh) / 2) * 0.96,
            },
            target: { x: tx, y: ty },
            width: rw,
            height: rh,
          });
        if (!coins) return go(rw - 40, 30);
        coins.measureInWindow((cx, cy, cw, ch) => go(cx - rx + Math.min(cw, ch) / 2 + 6, cy - ry + ch / 2));
      });
    });
  };

  const skipCelebration = () => {
    if (winOpen || !reward) return;
    clearCelebration();
    openResult(reward.stars, true);
  };

  useEffect(() => {
    if (game.status === 'won') return;
    recorded.current = false;
    clearCelebration();
    setCelebration(null);
    setCoinLag(0);
    setWinOpen(false);
  }, [game.status, clearCelebration]);

  useEffect(() => {
    if (game.status === 'out') {
      play('deny', 0.7);
      track('level_out_of_turns', { id: def.id });
    }
    if (game.status === 'jammed') track('level_jammed', { id: def.id });
  }, [game.status, def.id]);

  const boardSize = Math.min(width - SPACE.l * 2, height - insets.top - insets.bottom - 250, width >= 700 ? 760 : 560);
  const hubValue = game.limit ? Math.max(0, game.limit - game.turns) : game.turns;
  const freeUndo = def.budget === 0;

  const onUndo = () => {
    if (!game.canUndo) return;
    if (freeUndo || consumeBooster('undo')) game.undo();
    else flash(s.notEnough);
  };
  const onHint = () => {
    if (game.status !== 'playing') return;
    if (!consumeBooster('hint')) {
      flash(s.notEnough);
      return;
    }
    const h = game.findHint();
    if (!h) {
      update((p) => ({
        ...p,
        boosters: { ...p.boosters, hint: p.boosters.hint + 1 },
      }));
      flash(s.hintNone);
    } else flash(s.hintShow(Math.abs(h.notches)));
  };

  const onExtraTurnsAd = async () => {
    const granted = await showRewarded('extra_turns');
    if (granted) game.addTurns(3);
  };
  const onExtraTurnsCoins = () => {
    if (spendCoins(PRICES.extraTurns)) game.addTurns(3);
    else flash(s.notEnough);
  };
  const onDoubleCoins = async () => {
    if (!reward || reward.doubled) return;
    const granted = await showRewarded('double_coins');
    if (granted) {
      addCoins(reward.coins);
      setReward({ ...reward, coins: reward.coins * 2, doubled: true });
    }
  };

  const leaving = useRef(false);
  const firstClear = useRef(false);
  const onNextLevel = async () => {
    if (leaving.current) return; // double taps
    leaving.current = true;
    setWinOpen(false);
    try {
      if (mode.kind === 'campaign') await maybeShowInterstitial(levelNumber);
    } catch {
      // An ad problem must never keep the player on this screen.
    } finally {
      onNext?.({ firstClear: firstClear.current });
    }
  };

  const onShare = async () => {
    if (mode.kind !== 'daily') return;
    const [y, m, d] = mode.date.split('-').map(Number);
    const marks = game.clears.map((n) => (n === 0 ? '⚪' : n === 1 ? '🟢' : '💥')).join('');
    const streak = liveStreak(progress);
    const text = `${s.shareText(s.dateLong(new Date(y, m - 1, d)), game.turns, def.par, streak)}\n${marks}${LINKS.share ? `\n${LINKS.share}` : ''}`;
    track('daily_share', {});
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(text);
      flash(s.copied);
    } else {
      Share.share({ message: text }).catch(() => undefined);
    }
  };

  const title = isDaily ? s.daily : isVault ? s.vaultN(levelNumber / 10) : s.levelN(levelNumber);
  const subtitle = isDaily
    ? (() => {
        const [y, m, d] = (mode as { date: string }).date.split('-').map(Number);
        return s.dateLong(new Date(y, m - 1, d));
      })()
    : isVault
      ? s.levelN(levelNumber)
      : null;

  const ringDescription = useCallback(
    (r: number) => {
      const names = progress.settings.lang === 'en' ? PIN_NAMES_EN : PIN_NAMES_FR;
      const parts: string[] = [];
      for (let p = 0; p < game.state.S; p++) {
        const v = cellAt(game.state, r, p);
        parts.push(v === EMPTY ? '—' : v === BOLT ? '#' : v === WILD ? '*' : names[colorOf(v)]);
      }
      return parts.join(', ');
    },
    [game.state, progress.settings.lang],
  );

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={[
        styles.root,
        {
          paddingTop: insets.top + SPACE.s,
          paddingBottom: insets.bottom + SPACE.s,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={s.back} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={C.ivory} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="heading" numberOfLines={1} style={{ fontFamily: F.display, fontSize: isDaily ? 16 : 19 }}>
            {title}
          </Txt>
          {subtitle ? <Txt variant="tiny">{subtitle}</Txt> : null}
        </View>
        <View ref={coinsRef} collapsable={false}>
          <Coins value={progress.coins - coinLag} onPress={onShop} />
        </View>
      </View>

      <View style={styles.chips}>
        <View style={[styles.chip, styles.chipPar]}>
          <Txt variant="tiny" color={C.ink} style={{ fontFamily: F.uiBold }}>
            {s.par(def.par)}
          </Txt>
        </View>
        <View style={styles.chip}>
          <Txt variant="tiny" color={C.ivory}>
            {game.limit ? `${Math.max(0, game.limit - game.turns)} ${s.turns.toLowerCase()} ${s.turnsLeft}` : s.noLimit}
          </Txt>
        </View>
      </View>

      <View style={styles.boardWrap}>
        <View ref={boardRef} collapsable={false}>
          <Board
            celebrate={lap}
            skin={skin}
            game={game}
            size={boardSize}
            symbols={progress.settings.symbols}
            hubValue={hubValue}
            onNotch={notchFeedback}
            onDeny={() => {
              play('deny', 0.8);
              buzz.deny();
            }}
            onTurnStart={game.clearHint}
          />
        </View>
        {combo && (
          <Animated.View key={combo.id} entering={bannerEnter} exiting={FadeOut.duration(200)} style={styles.combo} pointerEvents="none">
            <Txt variant="title" color={C.brassLight} style={styles.comboText}>
              {s.combo(combo.n)}
            </Txt>
          </Animated.View>
        )}
      </View>

      {game.status === 'jammed' && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Txt variant="heading" color={C.ink}>
            {s.jammed}
          </Txt>
          <Txt variant="small" color={C.ink}>
            {s.jammedBody}
          </Txt>
        </View>
      )}

      {screenReader && (
        <View style={styles.a11y}>
          {Array.from({ length: game.state.R }, (_, r) => (
            <View key={r} style={styles.a11yRow}>
              <Txt variant="small" style={{ flex: 1 }}>{`${r + 1}: ${ringDescription(r)}`}</Txt>
              <IconButton icon="arrow-undo" label="−1" onPress={() => game.commit(r, -1)} disabled={!game.groupFor(r)} size={20} />
              <IconButton icon="arrow-redo" label="+1" onPress={() => game.commit(r, 1)} disabled={!game.groupFor(r)} size={20} />
            </View>
          ))}
        </View>
      )}

      <View style={styles.toolbar}>
        <IconButton
          icon="arrow-undo"
          label={s.undo}
          onPress={onUndo}
          disabled={!game.canUndo}
          badge={freeUndo ? undefined : progress.boosters.undo || PRICES.undo}
        />
        <IconButton icon="refresh" label={s.restart} onPress={game.restart} disabled={game.turns === 0 && game.status === 'playing'} />
        <IconButton
          icon="bulb-outline"
          label={s.hint}
          onPress={onHint}
          disabled={game.status !== 'playing'}
          badge={progress.boosters.hint || PRICES.hint}
        />
      </View>

      <Toast text={toast} />

      {/* Win celebration: drawn over everything, touches pass through; a tap skips to the card. */}
      {celebration && <Celebration spec={celebration} />}
      {game.status === 'won' && !winOpen && reward && (
        <Pressable style={StyleSheet.absoluteFill} onPress={skipCelebration} accessibilityLabel={s.next} />
      )}

      {/* Tutorial card for a new mechanic */}
      <Sheet
        visible={showIntro}
        onClose={() => {
          setShowIntro(false);
          if (def.intro) markIntroSeen(def.intro);
        }}
      >
        {def.intro && (
          <View style={{ gap: SPACE.m }}>
            <Txt variant="title">{s.intro[def.intro].title}</Txt>
            <Txt variant="body">{s.intro[def.intro].body}</Txt>
            {def.intro === 'basics' && <Txt variant="small">{s.fairLock}</Txt>}
            <Button
              label={s.ok}
              onPress={() => {
                setShowIntro(false);
                if (def.intro) markIntroSeen(def.intro);
              }}
              style={{ marginTop: SPACE.s }}
            />
          </View>
        )}
      </Sheet>

      {/* Out of turns */}
      <Sheet visible={game.status === 'out'}>
        <View style={{ gap: SPACE.m }}>
          <Txt variant="title">{s.outOfTurns}</Txt>
          <Txt variant="body">{s.outOfTurnsBody}</Txt>
          {adsAvailable() && <Button label={s.plusThree} sublabel={s.watchAd} icon="play-circle" onPress={onExtraTurnsAd} />}
          <Button
            label={s.plusThree}
            sublabel={s.forCoins(PRICES.extraTurns)}
            kind="secondary"
            onPress={onExtraTurnsCoins}
            disabled={progress.coins < PRICES.extraTurns}
          />
          <View style={{ flexDirection: 'row', gap: SPACE.s }}>
            <Button label={s.undo} kind="quiet" onPress={onUndo} disabled={!game.canUndo} style={{ flex: 1 }} />
            <Button label={s.restart} kind="quiet" onPress={game.restart} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>

      {/* Win */}
      <Sheet visible={winOpen} placement="bottom">
        {reward && (
          <View style={{ gap: SPACE.m, alignItems: 'center' }}>
            <Txt variant="title" center>
              {reward.stars === 3 ? s.perfect : s.cleared}
            </Txt>
            <StampStars value={reward.stars} />
            <Txt variant="body" center>
              {s.clearedIn(game.turns, def.par)}
            </Txt>
            {reward.stars < 3 && (
              <Txt variant="small" center>
                {s.fairLock}
              </Txt>
            )}
            {reward.coins > 0 && (
              <Txt variant="number" color={C.brassLight}>
                {s.coinsEarned(reward.coins)}
              </Txt>
            )}
            {isDaily && reward.streak ? <Txt variant="small">{s.streak(reward.streak)}</Txt> : null}
            {wonSkin && (
              <Txt variant="heading" color={C.brassLight} center>
                {s.newSkin(skinById(wonSkin)?.name[lang] ?? wonSkin)}
              </Txt>
            )}
            <View style={{ alignSelf: 'stretch', gap: SPACE.s, marginTop: SPACE.s }}>
              {isDaily ? (
                <>
                  <Button label={s.share} icon="share-outline" onPress={onShare} />
                  <Button label={s.home} kind="secondary" onPress={onBack} />
                </>
              ) : (
                <>
                  <Button label={s.next} onPress={onNextLevel} />
                  {adsAvailable() && reward.coins > 0 && !reward.doubled && (
                    <Button label={s.doubleCoins} sublabel={s.watchAd} kind="secondary" icon="play-circle" onPress={onDoubleCoins} />
                  )}
                  <Button
                    label={s.replay}
                    kind="quiet"
                    onPress={() => {
                      setWinOpen(false);
                      game.restart();
                    }}
                  />
                </>
              )}
            </View>
          </View>
        )}
      </Sheet>
    </View>
  );
}

export function expectedCoins(stars: number, daily: boolean): number {
  return coinsFor(stars, daily);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.petrol },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.l,
    minHeight: 48,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  chips: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.s,
    marginTop: SPACE.s,
  },
  chip: {
    paddingHorizontal: SPACE.m,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: C.petrolDeep,
  },
  chipPar: { backgroundColor: C.brassLight },
  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  combo: { position: 'absolute', top: '8%', alignSelf: 'center' },
  comboText: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  banner: {
    marginHorizontal: SPACE.l,
    marginBottom: SPACE.s,
    backgroundColor: C.brassLight,
    borderRadius: 18,
    padding: SPACE.m,
    gap: 2,
  },
  a11y: { paddingHorizontal: SPACE.l, gap: SPACE.xs, marginBottom: SPACE.s },
  a11yRow: { flexDirection: 'row', alignItems: 'center' },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: SPACE.xl,
    paddingVertical: SPACE.s,
    borderRadius: 24,
    backgroundColor: C.petrolDeep,
  },
});
