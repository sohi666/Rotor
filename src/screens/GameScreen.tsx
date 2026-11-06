import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Board } from '../game/Board';
import { useGame } from '../game/useGame';
import type { LevelDef } from '../engine/types';
import { colorOf, cellAt, WILD, EMPTY, BOLT } from '../engine';
import { C, F, PIN_NAMES_EN, PIN_NAMES_FR, SPACE } from '../theme';
import { Button, Coins, IconButton, Sheet, Stars, Toast, Txt } from '../ui/kit';
import { buzz, notchFeedback, play } from '../feedback';
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
import { useStrings } from '../useStrings';
import { adsAvailable, maybeShowInterstitial, showRewarded } from '../services/ads';
import { LINKS } from '../services/config';
import { track } from '../services/analytics';

export type GameMode = { kind: 'campaign'; index: number } | { kind: 'daily'; date: string };

interface Props {
  def: LevelDef;
  mode: GameMode;
  onBack: () => void;
  onNext?: () => void;
  onShop: () => void;
}

export function GameScreen({ def, mode, onBack, onNext, onShop }: Props) {
  const s = useStrings();
  const progress = useProgress();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const game = useGame(def);
  const [showIntro, setShowIntro] = useState(!!def.intro && !progress.seenIntros.includes(def.intro));
  const [winOpen, setWinOpen] = useState(false);
  const [reward, setReward] = useState<{ stars: number; coins: number; streak?: number; doubled?: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [combo, setCombo] = useState<{ id: number; n: number } | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  const recorded = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => undefined);
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

  // Win: record once, then open the result sheet after the burst plays out.
  useEffect(() => {
    if (game.status !== 'won' || recorded.current) return;
    recorded.current = true;
    let res: { stars: number; coins: number; streak?: number };
    if (mode.kind === 'campaign') {
      res = recordLevelWin(mode.index, def.id, game.turns, def.par);
    } else {
      const r = recordDaily(mode.date, { turns: game.turns, par: def.par, won: true, clears: game.clears });
      res = { stars: starsFor(game.turns, def.par), coins: r.coins, streak: r.streak };
    }
    track('level_win', { id: def.id, turns: game.turns, par: def.par });
    setReward(res);
    const t = setTimeout(() => {
      play('win');
      buzz.win();
      setWinOpen(true);
    }, 750);
    return () => clearTimeout(t);
  }, [game.status, game.turns, game.clears, def, mode]);

  useEffect(() => {
    if (game.status === 'won') return;
    recorded.current = false;
    setWinOpen(false);
  }, [game.status]);

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
      update((p) => ({ ...p, boosters: { ...p.boosters, hint: p.boosters.hint + 1 } }));
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

  const onNextLevel = async () => {
    setWinOpen(false);
    if (mode.kind === 'campaign') await maybeShowInterstitial(levelNumber);
    onNext?.();
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
    <View style={[styles.root, { paddingTop: insets.top + SPACE.s, paddingBottom: insets.bottom + SPACE.s }]}>
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
        <Coins value={progress.coins} onPress={onShop} />
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
        <Board
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
        {combo && (
          <Animated.View key={combo.id} entering={ZoomIn.springify().damping(12)} exiting={FadeOut.duration(200)} style={styles.combo} pointerEvents="none">
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
        <IconButton icon="arrow-undo" label={s.undo} onPress={onUndo} disabled={!game.canUndo} badge={freeUndo ? undefined : progress.boosters.undo || PRICES.undo} />
        <IconButton icon="refresh" label={s.restart} onPress={game.restart} disabled={game.turns === 0 && game.status === 'playing'} />
        <IconButton icon="bulb-outline" label={s.hint} onPress={onHint} disabled={game.status !== 'playing'} badge={progress.boosters.hint || PRICES.hint} />
      </View>

      <Toast text={toast} />

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
      <Sheet visible={winOpen}>
        {reward && (
          <View style={{ gap: SPACE.m, alignItems: 'center' }}>
            <Txt variant="title" center>
              {reward.stars === 3 ? s.perfect : s.cleared}
            </Txt>
            <Stars value={reward.stars} size={30} gap={12} />
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, minHeight: 48 },
  back: { width: 44, height: 44, justifyContent: 'center' },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.s, marginTop: SPACE.s },
  chip: {
    paddingHorizontal: SPACE.m,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: C.petrolDeep,
  },
  chipPar: { backgroundColor: C.brassLight },
  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  combo: { position: 'absolute', top: '8%', alignSelf: 'center' },
  comboText: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
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
