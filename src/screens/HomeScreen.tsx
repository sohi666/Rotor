import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, SPACE } from '../theme';
import { Button, Coins, Txt } from '../ui/kit';
import { MiniDial } from '../ui/MiniDial';
import { canClaimKey, chestProgress, claimDailyKey, liveStreak, localDateKey, openStarChest, useProgress, type Reward } from '../state/store';
import { DailyKeyStrip, RewardSheet, StarChestCard } from '../ui/rewards';
import { buzz, play, type Sfx } from '../feedback';
import { skinById } from '../skins';
import { useLang } from '../useStrings';
import { useStrings } from '../useStrings';

interface Props {
  campaignLength: number;
  onPlay: (index: number) => void;
  onDaily: () => void;
  onLevels: () => void;
  onShop?: () => void;
  onSettings: () => void;
  onLockbox: () => void;
  /** Styles granted at launch for vaults already cleared (shown once). */
  newSkins?: string[];
  onSeenNewSkins?: () => void;
}

function untilMidnight(): { h: number; m: number } {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 60000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

export function HomeScreen({ campaignLength, onPlay, onDaily, onLevels, onShop, onSettings, onLockbox, newSkins = [], onSeenNewSkins }: Props) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const today = localDateKey();
  const daily = p.daily[today];
  const streak = liveStreak(p, today);
  const current = Math.min(p.unlocked, campaignLength) - 1;
  const [clock, setClock] = useState(untilMidnight());
  const lang = useLang();
  const chest = chestProgress(p);
  const keyReady = canClaimKey(p, today);
  const [reveal, setReveal] = useState<{ title: string; icon: 'key-variant' | 'key-star' | 'treasure-chest'; rewards: Reward[] } | null>(null);

  const showRewards = (title: string, icon: 'key-variant' | 'key-star' | 'treasure-chest', rewards: Reward[]) => {
    setReveal({ title, icon, rewards });
    const golden = rewards.some((r) => r.kind === 'goldenKey');
    play(golden ? 'jackpot' : 'win');
    buzz.win();
    rewards.forEach((r, i) =>
      setTimeout(
        () => {
          play(r.kind === 'coins' ? (`coin${Math.min(i, 3) + 1}` as Sfx) : 'key');
          buzz.notch();
        },
        250 + i * 160,
      ),
    );
  };
  const onClaimKey = () => {
    const day = p.keys.day;
    const r = claimDailyKey(today);
    if (r) showRewards(`${s.dailyKey}, ${s.dayN(day).toLowerCase()}`, day === 7 ? 'key-star' : 'key-variant', r);
  };
  const onOpenChest = () => {
    const r = openStarChest();
    if (r) showRewards(s.starChest, 'treasure-chest', r);
  };
  useEffect(() => {
    const t = setInterval(() => setClock(untilMidnight()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.petrol }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.petrol }}
        contentContainerStyle={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.xl }]}
      >
        <View style={styles.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s }}>
            <Coins value={p.coins} onPress={onShop} />
            {p.goldenKeys > 0 && (
              <Pressable onPress={onLockbox} style={styles.keyPill} accessibilityRole="button" accessibilityLabel={s.rewardKeys(p.goldenKeys)}>
                <MaterialCommunityIcons name="key-star" size={18} color={C.ink} />
                <Text style={styles.keyPillText}>{p.goldenKeys}</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.l }}>
            {onShop && (
              <Pressable onPress={onShop} accessibilityRole="button" accessibilityLabel={s.shop} hitSlop={12}>
                <Ionicons name="storefront-outline" size={25} color={C.ivory} />
              </Pressable>
            )}
            <Pressable onPress={onSettings} accessibilityRole="button" accessibilityLabel={s.settings} hitSlop={12}>
              <Ionicons name="settings-outline" size={26} color={C.ivory} />
            </Pressable>
          </View>
        </View>

        <View style={{ flexGrow: 1, maxHeight: 60 }} />
        <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="Rotor">
          <Text style={styles.letter}>R</Text>
          <MiniDial size={58} delay={150} />
          <Text style={styles.letter}>T</Text>
          <MiniDial size={58} delay={330} spin={-1} />
          <Text style={styles.letter}>R</Text>
        </View>

        <View style={styles.dailyCard}>
          <Text style={styles.dailyDate}>{s.dateLong(new Date())}</Text>
          <Text style={styles.dailyTitle}>{s.daily}</Text>
          <Text style={styles.dailyBody}>{daily?.won ? s.dailyDone(daily.turns, daily.par) : s.dailyTodo}</Text>
          <View style={styles.streakRow}>
            <View style={[styles.streakDot, streak > 0 && { backgroundColor: C.danger }]} />
            <Text style={styles.streakText}>{streak > 0 ? s.streak(streak) : s.noStreak}</Text>
          </View>
          {daily?.won ? (
            <Text style={styles.dailyNext}>{s.dailyNext(clock.h, clock.m)}</Text>
          ) : (
            <Button label={s.dailyOpen} onPress={onDaily} style={{ marginTop: SPACE.m }} />
          )}
        </View>

        <Button
          label={s.play}
          sublabel={s.levelN(current + 1)}
          onPress={() => onPlay(current)}
          style={{ alignSelf: 'stretch' }}
          kind={daily?.won ? 'primary' : 'secondary'}
        />

        <DailyKeyStrip day={p.keys.day} canClaim={keyReady} onClaim={onClaimKey} />
        <StarChestCard have={chest.have} ready={chest.ready} onOpen={onOpenChest} />

        <View style={styles.row}>
          <Button label={s.levels} kind="secondary" icon="grid-outline" onPress={onLevels} style={{ flex: 1 }} />
          <Button label={s.lockbox} kind="secondary" icon="color-palette-outline" onPress={onLockbox} style={{ flex: 1 }} />
        </View>

        <View style={{ flexGrow: 1 }} />
        <Txt variant="tiny" center style={{ opacity: 0.8 }}>
          {s.fairLock}
        </Txt>
      </ScrollView>
      <RewardSheet
        visible={!!reveal}
        title={reveal?.title ?? ''}
        icon={reveal?.icon ?? 'treasure-chest'}
        rewards={reveal?.rewards ?? []}
        onCollect={() => setReveal(null)}
      />
      <RewardSheet
        visible={!reveal && newSkins.length > 0}
        title={s.newSkins}
        icon="lock-open-variant"
        rewards={[]}
        extra={
          <View style={{ alignSelf: 'stretch', gap: SPACE.s }}>
            {newSkins.map((id) => (
              <Text key={id} style={styles.newSkin}>
                {s.newSkin(skinById(id)?.name[lang] ?? id)}
              </Text>
            ))}
            <Button
              label={s.lockbox}
              kind="secondary"
              onPress={() => {
                onSeenNewSkins?.();
                onLockbox();
              }}
            />
          </View>
        }
        onCollect={() => onSeenNewSkins?.()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: SPACE.xl, gap: SPACE.l, flexGrow: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACE.xxl, marginBottom: SPACE.xl, gap: 2 },
  letter: { fontFamily: F.display, fontSize: 64, color: C.ivory, includeFontPadding: false, letterSpacing: -1 },
  dailyCard: {
    backgroundColor: C.ivory,
    borderRadius: 26,
    padding: SPACE.xl,
    borderWidth: 3,
    borderColor: C.brass,
  },
  dailyTitle: { fontFamily: F.display, fontSize: 20, color: C.ink },
  dailyDate: { fontFamily: F.uiSemi, fontSize: 14, color: C.brassDeep, marginBottom: 2 },
  dailyBody: { fontFamily: F.ui, fontSize: 16, color: C.ink, marginTop: SPACE.s, lineHeight: 22 },
  dailyNext: { fontFamily: F.uiSemi, fontSize: 14, color: C.brassDeep, marginTop: SPACE.m },
  streakRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.s, gap: SPACE.s },
  streakDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.groove },
  streakText: { fontFamily: F.uiSemi, fontSize: 14, color: C.ink },
  row: { flexDirection: 'row', gap: SPACE.m },
  keyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.brassLight,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  keyPillText: { fontFamily: F.uiBold, fontSize: 15, color: C.ink },
  newSkin: { fontFamily: F.uiSemi, fontSize: 16, color: C.ivory, textAlign: 'center' },
});
