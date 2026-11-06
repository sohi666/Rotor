import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SPACE } from '../theme';
import { Button, Coins, Txt } from '../ui/kit';
import { MiniDial } from '../ui/MiniDial';
import { liveStreak, localDateKey, useProgress } from '../state/store';
import { useStrings } from '../useStrings';

interface Props {
  campaignLength: number;
  onPlay: (index: number) => void;
  onDaily: () => void;
  onLevels: () => void;
  onShop: () => void;
  onSettings: () => void;
}

function untilMidnight(): { h: number; m: number } {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 60000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

export function HomeScreen({ campaignLength, onPlay, onDaily, onLevels, onShop, onSettings }: Props) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const today = localDateKey();
  const daily = p.daily[today];
  const streak = liveStreak(p, today);
  const current = Math.min(p.unlocked, campaignLength) - 1;
  const [clock, setClock] = useState(untilMidnight());
  useEffect(() => {
    const t = setInterval(() => setClock(untilMidnight()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.petrol }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.xl }]}
    >
      <View style={styles.topBar}>
        <Coins value={p.coins} onPress={onShop} />
        <Pressable onPress={onSettings} accessibilityRole="button" accessibilityLabel={s.settings} hitSlop={12}>
          <Ionicons name="settings-outline" size={26} color={C.ivory} />
        </Pressable>
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

      <Button label={s.play} sublabel={s.levelN(current + 1)} onPress={() => onPlay(current)} style={{ alignSelf: 'stretch' }} kind={daily?.won ? 'primary' : 'secondary'} />

      <View style={styles.row}>
        <Button label={s.levels} kind="secondary" icon="grid-outline" onPress={onLevels} style={{ flex: 1 }} />
        <Button label={s.shop} kind="secondary" icon="storefront-outline" onPress={onShop} style={{ flex: 1 }} />
      </View>

      <View style={{ flexGrow: 1 }} />
      <Txt variant="tiny" center style={{ opacity: 0.8 }}>
        {s.fairLock}
      </Txt>
    </ScrollView>
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
});
