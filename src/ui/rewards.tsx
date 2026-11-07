import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F, SPACE } from '../theme';
import { Button, Sheet, Txt } from './kit';
import { KEY_REWARDS, STAR_CHEST_COST, type Reward } from '../state/store';
import { useStrings } from '../useStrings';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function rewardIcon(r: Reward): IconName {
  return r.kind === 'coins' ? 'circle-multiple' : r.kind === 'hint' ? 'lightbulb-on' : r.kind === 'undo' ? 'undo-variant' : 'key-star';
}

export function useRewardLabel() {
  const s = useStrings();
  return (r: Reward) =>
    r.kind === 'coins' ? s.rewardCoins(r.n) : r.kind === 'hint' ? s.rewardHints(r.n) : r.kind === 'undo' ? s.rewardUndos(r.n) : s.rewardKeys(r.n);
}

/** One reward line: brass medallion icon + label. */
function RewardLine({ r, delay }: { r: Reward; delay: number }) {
  const label = useRewardLabel();
  const gold = r.kind === 'goldenKey';
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(260)} style={styles.line}>
      <View style={[styles.medal, gold && styles.medalGold]}>
        <MaterialCommunityIcons name={rewardIcon(r)} size={22} color={gold ? C.ink : C.ivory} />
      </View>
      <Txt variant="heading">{label(r)}</Txt>
    </Animated.View>
  );
}

/**
 * Reward reveal: big icon, the contents one line at a time, then Collect.
 * Line delays: 250 ms + 160 ms each (the caller times coin sounds to match).
 */
export function RewardSheet({
  visible,
  title,
  icon,
  rewards,
  extra,
  onCollect,
}: {
  visible: boolean;
  title: string;
  icon: IconName;
  rewards: Reward[];
  extra?: React.ReactNode;
  onCollect: () => void;
}) {
  const s = useStrings();
  return (
    <Sheet visible={visible} onClose={onCollect}>
      <View style={{ alignItems: 'center', gap: SPACE.m }}>
        <Animated.View entering={FadeIn.duration(220)} style={styles.bigIcon}>
          <MaterialCommunityIcons name={icon} size={54} color={C.brassLight} />
        </Animated.View>
        <Txt variant="title" center>
          {title}
        </Txt>
        <View style={{ alignSelf: 'stretch', gap: SPACE.s }}>
          {rewards.map((r, i) => (
            <RewardLine key={`${r.kind}${i}`} r={r} delay={250 + i * 160} />
          ))}
        </View>
        {extra}
        <Button label={s.collect} onPress={onCollect} style={{ alignSelf: 'stretch', marginTop: SPACE.s }} />
      </View>
    </Sheet>
  );
}

/** Seven key slots: claimed (filled), today (ringed), upcoming; day 7 is the golden key. */
export function DailyKeyStrip({ day, canClaim, onClaim }: { day: number; canClaim: boolean; onClaim: () => void }) {
  const s = useStrings();
  // `day` is the next day to claim. Once today's key is taken, today is the previous day
  // (day 7 when the calendar has just wrapped back to day 1).
  const today = canClaim ? day : day === 1 ? 7 : day - 1;
  const claimedThrough = canClaim ? day - 1 : today;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <MaterialCommunityIcons name="key-variant" size={20} color={C.brassLight} />
        <Text style={styles.cardTitle}>{s.dailyKey}</Text>
        <Text style={styles.cardMeta}>{s.dayN(today)}</Text>
      </View>
      <View style={styles.keys} accessibilityElementsHidden>
        {KEY_REWARDS.map((r, i) => {
          const n = i + 1;
          const done = n <= claimedThrough;
          const isToday = canClaim && n === day;
          const gold = n === 7;
          return (
            <View key={n} style={[styles.keySlot, done && styles.keyDone, isToday && styles.keyToday, gold && !done && styles.keyGold]}>
              <MaterialCommunityIcons
                name={done ? 'check-bold' : gold ? 'key-star' : rewardIcon(r[0])}
                size={16}
                color={done ? C.petrolDeep : gold ? C.ink : C.ivoryDim}
              />
            </View>
          );
        })}
      </View>
      {canClaim ? <Button label={s.claim} onPress={onClaim} style={{ marginTop: SPACE.m }} /> : <Text style={styles.cardNote}>{s.keyTomorrow}</Text>}
    </View>
  );
}

/** Progress toward the next star chest. */
export function StarChestCard({ have, ready, onOpen }: { have: number; ready: number; onOpen: () => void }) {
  const s = useStrings();
  const pct = Math.min(1, have / STAR_CHEST_COST);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <MaterialCommunityIcons name="treasure-chest" size={20} color={C.brassLight} />
        <Text style={styles.cardTitle}>{s.starChest}</Text>
        <Text style={styles.cardMeta}>{ready > 0 ? s.starChestReady(ready) : `${have} / ${STAR_CHEST_COST}`}</Text>
      </View>
      <View style={styles.bar} accessibilityLabel={`${have} / ${STAR_CHEST_COST}`}>
        <View style={[styles.barFill, { width: `${pct * 100}%` }, ready > 0 && { backgroundColor: C.brassLight }]} />
      </View>
      {ready > 0 ? (
        <Button label={s.openChest} onPress={onOpen} style={{ marginTop: SPACE.m }} />
      ) : (
        <Text style={styles.cardNote}>{s.starChestLeft(STAR_CHEST_COST - have)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  medal: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.petrolDeep,
    borderWidth: 2,
    borderColor: C.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalGold: { backgroundColor: C.brassLight, borderColor: C.brassDeep },
  bigIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: C.petrolDeep,
    borderWidth: 3,
    borderColor: C.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { backgroundColor: C.petrolDeep, borderRadius: 22, padding: SPACE.l, borderWidth: 2, borderColor: C.petrolLine },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  cardTitle: { fontFamily: F.uiBold, fontSize: 16, color: C.ivory, flex: 1 },
  cardMeta: { fontFamily: F.uiSemi, fontSize: 13, color: C.brassLight },
  cardNote: { fontFamily: F.ui, fontSize: 14, color: C.ivoryDim, marginTop: SPACE.m },
  keys: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.m },
  keySlot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.petrolLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDone: { backgroundColor: C.brass, borderColor: C.brass },
  keyToday: { borderColor: C.brassLight, borderWidth: 3 },
  keyGold: { backgroundColor: C.brassLight, borderColor: C.brassDeep },
  bar: { height: 12, borderRadius: 6, backgroundColor: C.petrol, marginTop: SPACE.m, overflow: 'hidden', borderWidth: 1, borderColor: C.petrolLine },
  barFill: { height: '100%', backgroundColor: C.brass, borderRadius: 6 },
});
