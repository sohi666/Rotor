import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { LevelDef } from '../engine/types';
import { C, F, PIN_COLORS, SPACE } from '../theme';
import { Txt } from '../ui/kit';
import { useProgress } from '../state/store';
import { useStrings } from '../useStrings';

const COLS = 5;

export function LevelsScreen({ levels, onOpen, onBack }: { levels: LevelDef[]; onOpen: (index: number) => void; onBack: () => void }) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cell = Math.min(76, (Math.min(width, 520) - SPACE.l * 2) / COLS);
  const initialRow = Math.max(0, Math.floor((p.unlocked - 1) / COLS) - 2);
  const rows = useMemo(() => {
    const out: number[][] = [];
    for (let i = 0; i < levels.length; i += COLS) out.push(Array.from({ length: Math.min(COLS, levels.length - i) }, (_, k) => i + k));
    return out;
  }, [levels.length]);

  return (
    <View style={{ flex: 1, backgroundColor: C.petrol, paddingTop: insets.top + SPACE.s }}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={s.back} hitSlop={12} style={{ width: 44 }}>
          <Ionicons name="chevron-back" size={28} color={C.ivory} />
        </Pressable>
        <Txt variant="title" style={{ flex: 1, textAlign: 'center', fontSize: 22 }}>
          {s.levels}
        </Txt>
        <View style={{ width: 44 }} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r[0])}
        initialScrollIndex={Math.min(initialRow, rows.length - 1)}
        getItemLayout={(_, index) => ({ length: cell + 22, offset: (cell + 22) * index, index })}
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xl, alignItems: 'center' }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', height: cell + 22 }}>
            {item.map((i) => {
              const lv = levels[i];
              const n = i + 1;
              const open = n <= p.unlocked;
              const stars = p.stars[lv.id] ?? 0;
              const vault = n % 10 === 0;
              return (
                <Pressable
                  key={lv.id}
                  disabled={!open}
                  onPress={() => onOpen(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${vault ? s.vaultN(n / 10) : s.levelN(n)}${open ? `, ${s.stars(stars)}` : `, ${s.locked}`}`}
                  style={{ width: cell, alignItems: 'center' }}
                >
                  <View
                    style={[
                      styles.dial,
                      { width: cell - 12, height: cell - 12, borderRadius: (cell - 12) / 2 },
                      vault && styles.vault,
                      !open && styles.lockedDial,
                      n === p.unlocked && styles.current,
                    ]}
                  >
                    {open ? (
                      <Text style={[styles.num, { fontSize: cell * 0.26 }]}>{n}</Text>
                    ) : (
                      <Ionicons name="lock-closed" size={cell * 0.24} color={C.petrolLine} />
                    )}
                  </View>
                  <View style={styles.pips}>
                    {[0, 1, 2].map((k) => (
                      <View key={k} style={[styles.pip, k < stars && { backgroundColor: PIN_COLORS[k] }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, marginBottom: SPACE.m },
  dial: { backgroundColor: C.ivory, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.track },
  vault: { borderColor: C.brass, borderWidth: 4 },
  lockedDial: { backgroundColor: C.petrolDeep, borderColor: C.petrolSoft },
  current: { borderColor: C.brassLight, borderWidth: 4 },
  num: { fontFamily: F.display, color: C.ink },
  pips: { flexDirection: 'row', gap: 4, marginTop: 5 },
  pip: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.petrolSoft },
});
