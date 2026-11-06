import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Unbounded_500Medium, Unbounded_700Bold } from '@expo-google-fonts/unbounded';
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import levelsJson from './src/data/levels.json';
import dailyJson from './src/data/daily.json';
import type { LevelDef } from './src/engine/types';
import { C } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen, type GameMode } from './src/screens/GameScreen';
import { LevelsScreen } from './src/screens/LevelsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import { localDateKey } from './src/state/store';
import { initAudio, warmUp } from './src/feedback';
import { initAds } from './src/services/ads';
import { initPurchases } from './src/services/purchases';
import { track } from './src/services/analytics';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const LEVELS = levelsJson as unknown as LevelDef[];
const DAILY = dailyJson as unknown as Record<string, LevelDef>;
const DAILY_DATES = Object.keys(DAILY).sort();

/** Today's lock; past the generated range, cycle through the archive so the game never runs dry. */
export function dailyFor(date: string): LevelDef {
  if (DAILY[date]) return DAILY[date];
  const [y, m, d] = date.split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const pick = DAILY[DAILY_DATES[days % DAILY_DATES.length]];
  return { ...pick, id: `D${date}` };
}

/** Web preview only: `?level=31` or `?daily=2026-11-20` opens a board directly (QA and store screenshots). */
function initialStack(): Route[] {
  const home: Route = { name: 'home' };
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [home];
  const q = new URLSearchParams(window.location.search);
  const level = Number(q.get('level'));
  if (level >= 1 && level <= LEVELS.length) return [home, { name: 'game', mode: { kind: 'campaign', index: level - 1 } }];
  const daily = q.get('daily');
  if (daily) return [home, { name: 'game', mode: { kind: 'daily', date: daily } }];
  return [home];
}

type Route =
  | { name: 'home' }
  | { name: 'levels' }
  | { name: 'settings' }
  | { name: 'shop' }
  | { name: 'game'; mode: GameMode };

export default function App() {
  const [fontsLoaded] = useFonts({ Unbounded_500Medium, Unbounded_700Bold, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold });
  const [stack, setStack] = useState<Route[]>(initialStack);
  const route = stack[stack.length - 1];

  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => undefined);
    track('app_open', {});
    initAudio().then(warmUp);
    // Consent and SDK start-up happen after first paint so the home screen shows immediately.
    const t = setTimeout(() => {
      initPurchases();
      initAds();
    }, 800);
    return () => clearTimeout(t);
  }, [fontsLoaded]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const gameDef = useMemo(() => {
    if (route.name !== 'game') return null;
    return route.mode.kind === 'campaign' ? LEVELS[route.mode.index] : dailyFor(route.mode.date);
  }, [route]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.petrol }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.petrol }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {route.name === 'home' && (
          <HomeScreen
            campaignLength={LEVELS.length}
            onPlay={(index) => push({ name: 'game', mode: { kind: 'campaign', index } })}
            onDaily={() => push({ name: 'game', mode: { kind: 'daily', date: localDateKey() } })}
            onLevels={() => push({ name: 'levels' })}
            onShop={() => push({ name: 'shop' })}
            onSettings={() => push({ name: 'settings' })}
          />
        )}
        {route.name === 'levels' && (
          <LevelsScreen levels={LEVELS} onBack={pop} onOpen={(index) => push({ name: 'game', mode: { kind: 'campaign', index } })} />
        )}
        {route.name === 'settings' && <SettingsScreen onBack={pop} onShop={() => push({ name: 'shop' })} />}
        {route.name === 'shop' && <ShopScreen onBack={pop} />}
        {route.name === 'game' && gameDef && (
          <GameScreen
            key={gameDef.id}
            def={gameDef}
            mode={route.mode}
            onBack={pop}
            onShop={() => push({ name: 'shop' })}
            onNext={
              route.mode.kind === 'campaign' && route.mode.index + 1 < LEVELS.length
                ? () => replace({ name: 'game', mode: { kind: 'campaign', index: (route.mode as { index: number }).index + 1 } })
                : pop
            }
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
