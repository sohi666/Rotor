import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Board } from '../game/Board';
import { useGame } from '../game/useGame';
import type { LevelDef } from '../engine/types';
import { C, F, SPACE } from '../theme';
import { Button, Coins, Toast, Txt } from '../ui/kit';
import { buzz, notchFeedback, play } from '../feedback';
import { useProgress } from '../state/store';
import { useLang, useStrings } from '../useStrings';
import {
  ALL_SKINS,
  DIALS,
  HUBS,
  PINS,
  VAULT_SKINS,
  buySkin,
  equipSkin,
  openWithGoldenKey,
  resolveSkin,
  type AnySkin,
  type DialSkin,
  type HubSkin,
  type PinSkin,
  type SkinKind,
} from '../skins';

/** A small board showing all six pin colours, turnable, used to preview a style. */
const PREVIEW: LevelDef = {
  id: 'lockbox-preview',
  spokes: 6,
  rings: ['abcdef', 'cdefab', 'efabcd'],
  par: 3,
  budget: 0,
  solution: [],
  difficulty: 1,
};

export function LockboxScreen({ onBack, onShop }: { onBack: () => void; onShop: () => void }) {
  const s = useStrings();
  const p = useProgress();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<SkinKind>('dial');
  const [picked, setPicked] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const game = useGame(PREVIEW);
  const lang = useLang();

  const list: AnySkin[] = tab === 'dial' ? DIALS : tab === 'pins' ? PINS : HUBS;
  const selected = picked ? ALL_SKINS.find((x) => x.id === picked) : undefined;
  const preview = useMemo(() => {
    const sel = { ...p.skins };
    if (selected) sel[selected.kind] = selected.id;
    return resolveSkin(sel);
  }, [p.skins, selected]);

  const owned = (id: string) => p.skins.owned.includes(id);
  const equipped = (x: AnySkin) => p.skins[x.kind] === x.id;
  const vaultOf = (id: string) => VAULT_SKINS.indexOf(id) + 1;

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 1800);
  };

  const onEquip = (x: AnySkin) => {
    equipSkin(x.id);
    play('key');
    buzz.tap();
  };
  const onBuy = (x: AnySkin) => {
    if (buySkin(x.id)) {
      equipSkin(x.id);
      play('jackpot');
      buzz.win();
    } else flash(s.notEnough);
  };
  const onKey = (x: AnySkin) => {
    if (openWithGoldenKey(x.id)) {
      equipSkin(x.id);
      play('jackpot');
      buzz.win();
    }
  };

  const boardSize = Math.min(width - SPACE.xl * 2, 290);
  const total = ALL_SKINS.length;
  const have = ALL_SKINS.filter((x) => owned(x.id)).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.s }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={s.back} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={C.ivory} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="heading" style={{ fontFamily: F.display, fontSize: 19 }}>
            {s.lockbox}
          </Txt>
          <Txt variant="tiny">{s.lockboxCount(have, total)}</Txt>
        </View>
        <Coins value={p.coins} onPress={onShop} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.xl, paddingBottom: insets.bottom + SPACE.xl, gap: SPACE.l }}>
        <View style={{ alignItems: 'center', marginTop: SPACE.s }}>
          <Board
            game={game}
            size={boardSize}
            symbols={p.settings.symbols}
            hubValue={7}
            onNotch={notchFeedback}
            onDeny={() => undefined}
            skin={preview}
          />
        </View>

        {p.goldenKeys > 0 && (
          <View style={styles.keyNote}>
            <MaterialCommunityIcons name="key-star" size={22} color={C.ink} />
            <Text style={styles.keyNoteText}>
              {s.rewardKeys(p.goldenKeys)}. {s.goldenKeyHint}
            </Text>
          </View>
        )}

        <View style={styles.tabs} accessibilityRole="tablist">
          {(['dial', 'pins', 'hub'] as SkinKind[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                setTab(k);
                setPicked(null);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              style={[styles.tab, tab === k && styles.tabOn]}
            >
              <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{k === 'dial' ? s.dials : k === 'pins' ? s.pinsSet : s.hubs}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.grid}>
          {list.map((x) => {
            const isPicked = (picked ?? p.skins[tab]) === x.id;
            const has = owned(x.id);
            return (
              <Pressable
                key={x.id}
                onPress={() => {
                  setPicked(x.id);
                  play('tap', 0.6);
                }}
                accessibilityRole="button"
                accessibilityLabel={x.name[lang]}
                accessibilityState={{ selected: isPicked }}
                style={[styles.item, isPicked && styles.itemOn]}
              >
                <Swatch skin={x} dim={!has} />
                <Text style={styles.itemName} numberOfLines={1}>
                  {x.name[lang]}
                </Text>
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {equipped(x) ? s.equipped : has ? ' ' : vaultOf(x.id) > 0 ? s.fromVault(vaultOf(x.id)) : `${x.price}`}
                </Text>
                {!has && <Ionicons name="lock-closed" size={14} color={C.ivoryDim} style={styles.lock} />}
              </Pressable>
            );
          })}
        </View>

        {selected && (
          <View style={{ gap: SPACE.s }}>
            {owned(selected.id) ? (
              <Button label={equipped(selected) ? s.equipped : s.equip} onPress={() => onEquip(selected)} disabled={equipped(selected)} />
            ) : (
              <>
                <Button label={s.buyFor(selected.price)} onPress={() => onBuy(selected)} />
                {p.goldenKeys > 0 && <Button label={s.useGoldenKey} kind="secondary" icon="key" onPress={() => onKey(selected)} />}
              </>
            )}
          </View>
        )}
      </ScrollView>
      <Toast text={toast} />
    </View>
  );
}

/** Tiny visual of a style, made of plain views. */
function Swatch({ skin, dim }: { skin: AnySkin; dim: boolean }) {
  const o = dim ? 0.55 : 1;
  if (skin.kind === 'dial') {
    const d = skin as DialSkin;
    return (
      <View style={[styles.sw, { backgroundColor: d.rim[1], borderColor: d.rim[2], opacity: o }]}>
        <View style={[styles.swFace, { backgroundColor: d.face }]}>
          <View style={[styles.swTrack, { borderColor: d.track }]}>
            <View style={[styles.swDot, { backgroundColor: d.accentDeep }]} />
          </View>
        </View>
      </View>
    );
  }
  if (skin.kind === 'pins') {
    const pn = skin as PinSkin;
    return (
      <View style={[styles.swPins, { opacity: o }]}>
        {pn.colors.map((c, i) => (
          <View key={i} style={[styles.pin, { backgroundColor: c, borderColor: pn.rims[i] }]} />
        ))}
      </View>
    );
  }
  const h = skin as HubSkin;
  return (
    <View style={[styles.sw, { backgroundColor: h.metal[1], borderColor: h.metal[2], opacity: o }]}>
      <View style={[styles.swWell, { backgroundColor: h.well }]}>
        <Text style={{ color: h.text, fontFamily: F.uiBold, fontSize: 13 }}>7</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.petrol },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, minHeight: 48 },
  back: { width: 44, height: 44, justifyContent: 'center' },
  keyNote: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: C.brassLight, borderRadius: 16, padding: SPACE.m },
  keyNoteText: { flex: 1, fontFamily: F.uiSemi, fontSize: 14, color: C.ink },
  tabs: { flexDirection: 'row', backgroundColor: C.petrolDeep, borderRadius: 22, padding: 4 },
  tab: { flex: 1, paddingVertical: SPACE.s, borderRadius: 18, alignItems: 'center' },
  tabOn: { backgroundColor: C.brass },
  tabText: { fontFamily: F.uiSemi, fontSize: 15, color: C.ivoryDim },
  tabTextOn: { color: C.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '3.5%', rowGap: SPACE.m },
  item: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: SPACE.m,
    borderRadius: 18,
    backgroundColor: C.petrolDeep,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  itemOn: { borderColor: C.brassLight },
  itemName: { fontFamily: F.uiBold, fontSize: 14, color: C.ivory, marginTop: SPACE.s },
  itemMeta: { fontFamily: F.ui, fontSize: 12, color: C.ivoryDim, marginTop: 2 },
  lock: { position: 'absolute', top: 8, right: 10 },
  sw: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swFace: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  swTrack: { width: 28, height: 28, borderRadius: 14, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  swDot: { width: 6, height: 6, borderRadius: 3 },
  swWell: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  swPins: { width: 60, height: 54, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center', justifyContent: 'center' },
  pin: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
});
