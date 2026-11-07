import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { C, F, SPACE } from '../theme';
import { Button, Toast, Txt } from '../ui/kit';
import { setSetting, useProgress } from '../state/store';
import { useLang, useStrings } from '../useStrings';
import { LINKS, siteLink } from '../services/config';
import { restore } from '../services/purchases';
import type { Lang } from '../i18n';

export function SettingsScreen({ onBack, onShop }: { onBack: () => void; onShop?: () => void }) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<string | null>(null);

  const row = (label: string, value: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Txt variant="body">{label}</Txt>
        {hint ? <Txt variant="small">{hint}</Txt> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: C.brass, false: C.petrolSoft }}
        thumbColor={C.ivory}
        accessibilityLabel={label}
      />
    </View>
  );

  const lang = useLang();
  const langs: { key: Lang | null; label: string }[] = [
    { key: null, label: s.langAuto },
    { key: 'fr', label: 'Français' },
    { key: 'en', label: 'English' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.petrol, paddingTop: insets.top + SPACE.s }}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={s.back} hitSlop={12} style={{ width: 44 }}>
          <Ionicons name="chevron-back" size={28} color={C.ivory} />
        </Pressable>
        <Txt variant="title" style={{ flex: 1, textAlign: 'center', fontSize: 22 }}>
          {s.settings}
        </Txt>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACE.xl, gap: SPACE.l, paddingBottom: insets.bottom + SPACE.xl }}>
        {row(s.sound, p.settings.sound, (v) => setSetting('sound', v))}
        {row(s.haptics, p.settings.haptics, (v) => setSetting('haptics', v))}
        {row(s.symbols, p.settings.symbols, (v) => setSetting('symbols', v), s.symbolsHint)}

        <View style={{ gap: SPACE.s }}>
          <Txt variant="body">{s.language}</Txt>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {langs.map((l) => {
              const active = p.settings.lang === l.key;
              return (
                <Pressable
                  key={String(l.key)}
                  onPress={() => setSetting('lang', l.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[styles.segItem, active && styles.segActive]}
                >
                  <Txt variant="small" color={active ? C.ink : C.ivory} style={{ fontFamily: F.uiSemi }}>
                    {l.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {onShop && (
          <>
            {p.adsRemoved ? (
              <Txt variant="body" color={C.brassLight}>
                {s.adsRemoved}
              </Txt>
            ) : (
              <Button label={s.removeAds} icon="sparkles-outline" onPress={onShop} />
            )}
            <Button
              label={s.restore}
              kind="secondary"
              onPress={async () => {
                const ok = await restore();
                setToast(ok ? s.adsRemoved : s.purchaseFailed);
                setTimeout(() => setToast(null), 2200);
              }}
            />

            <View style={styles.divider} />
          </>
        )}

        {[
          { label: s.privacy, url: siteLink('privacy', lang) },
          { label: s.terms, url: siteLink('terms', lang) },
          { label: s.contact, url: LINKS.contact || siteLink('support', lang) },
        ].map((l) => (
          <Pressable key={l.label} onPress={() => Linking.openURL(l.url).catch(() => undefined)} accessibilityRole="link" style={styles.link}>
            <Txt variant="body">{l.label}</Txt>
            <Ionicons name="open-outline" size={18} color={C.ivoryDim} />
          </Pressable>
        ))}
        <Txt variant="tiny" style={{ marginTop: SPACE.l }}>
          Rotor {Constants.expoConfig?.version ?? ''} ·{' '}
          {Updates.isEmbeddedLaunch || !Updates.updateId ? 'build' : `update ${Updates.updateId.slice(0, 8)}`}
        </Txt>
        <Txt variant="tiny" style={{ marginTop: SPACE.xs, opacity: 0.75 }}>
          {s.soundCredit}
        </Txt>
      </ScrollView>
      <Toast text={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  segment: { flexDirection: 'row', backgroundColor: C.petrolDeep, borderRadius: 20, padding: 4 },
  segItem: { flex: 1, paddingVertical: SPACE.s, alignItems: 'center', borderRadius: 16 },
  segActive: { backgroundColor: C.ivory },
  divider: { height: 1, backgroundColor: C.petrolLine, marginVertical: SPACE.s },
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.xs },
});
