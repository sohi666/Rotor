import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, SPACE } from '../theme';
import { Button, Coins, Toast, Txt } from '../ui/kit';
import { useProgress, PRICES } from '../state/store';
import { useStrings } from '../useStrings';
import { buy, shopItems } from '../services/purchases';
import { PRODUCTS } from '../services/config';

export function ShopScreen({ onBack }: { onBack: () => void }) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const items = shopItems();

  const purchase = async (id: string) => {
    setBusy(id);
    const res = await buy(id);
    setBusy(null);
    if (res === 'ok') setToast(s.purchaseThanks);
    else if (res === 'failed') setToast(s.purchaseFailed);
    setTimeout(() => setToast(null), 2400);
  };

  const removeAds = items.find((i) => i.id === PRODUCTS.removeAds);

  return (
    <View style={{ flex: 1, backgroundColor: C.petrol, paddingTop: insets.top + SPACE.s }}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={s.back} hitSlop={12} style={{ width: 44 }}>
          <Ionicons name="chevron-back" size={28} color={C.ivory} />
        </Pressable>
        <Txt variant="title" style={{ flex: 1, textAlign: 'center', fontSize: 22 }}>
          {s.shop}
        </Txt>
        <Coins value={p.coins} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACE.xl, gap: SPACE.l, paddingBottom: insets.bottom + SPACE.xl }}>
        {!p.adsRemoved && removeAds && (
          <View style={styles.card}>
            <Txt variant="heading" color={C.ink}>
              {s.removeAds}
            </Txt>
            <Txt variant="small" color={C.ink}>
              {s.removeAdsBody}
            </Txt>
            <Button
              label={removeAds.price ? `${s.buy}, ${removeAds.price}` : s.unavailable}
              disabled={!removeAds.price || busy !== null}
              onPress={() => purchase(removeAds.id)}
              style={{ marginTop: SPACE.m }}
            />
          </View>
        )}
        <Txt variant="heading">{s.coins}</Txt>
        <Txt variant="small">
          {`${s.hint} ${PRICES.hint}, ${s.undo.toLowerCase()} ${PRICES.undo}, ${s.plusThree} ${PRICES.extraTurns}`}
        </Txt>
        {items
          .filter((i) => i.coins)
          .map((i) => (
            <View key={i.id} style={styles.pack}>
              <Txt variant="number" style={{ flex: 1 }}>
                {s.coinPack(i.coins!)}
              </Txt>
              <Button
                label={i.price ?? s.unavailable}
                kind="secondary"
                disabled={!i.price || busy !== null}
                onPress={() => purchase(i.id)}
                style={{ minWidth: 120 }}
              />
            </View>
          ))}
      </ScrollView>
      <Toast text={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l },
  card: { backgroundColor: C.ivory, borderRadius: 24, padding: SPACE.xl, borderWidth: 3, borderColor: C.brass, gap: SPACE.xs },
  pack: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.petrolDeep, borderRadius: 20, padding: SPACE.m, paddingLeft: SPACE.l },
});
