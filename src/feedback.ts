import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import { getProgress } from './state/store';

/** Sound effects, created on first use. Several players per click sound so fast spins don't cut off. */
const SOURCES = {
  notch: [require('../assets/sfx/notch.wav'), require('../assets/sfx/notch2.wav'), require('../assets/sfx/notch3.wav')],
  unlock: [require('../assets/sfx/unlock.wav')],
  combo2: [require('../assets/sfx/combo2.wav')],
  combo3: [require('../assets/sfx/combo3.wav')],
  win: [require('../assets/sfx/win.wav')],
  deny: [require('../assets/sfx/deny.wav')],
  tap: [require('../assets/sfx/tap.wav')],
  key: [require('../assets/sfx/key.wav')],
} as const;

type Sfx = keyof typeof SOURCES;

const pools = new Map<Sfx, AudioPlayer[]>();
const cursor = new Map<Sfx, number>();
let ready = false;

export async function initAudio(): Promise<void> {
  if (ready) return;
  ready = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
  } catch {
    // Audio mode is best-effort; sounds still play with defaults.
  }
}

function pool(name: Sfx): AudioPlayer[] {
  let p = pools.get(name);
  if (!p) {
    const copies = name === 'notch' ? 2 : 1;
    p = [];
    for (const src of SOURCES[name]) for (let i = 0; i < copies; i++) p.push(createAudioPlayer(src));
    pools.set(name, p);
  }
  return p;
}

export function play(name: Sfx, volume = 1): void {
  if (!getProgress().settings.sound) return;
  try {
    const p = pool(name);
    const i = ((cursor.get(name) ?? -1) + 1) % p.length;
    cursor.set(name, i);
    const player = p[i];
    player.volume = volume;
    player.seekTo(0);
    player.play();
  } catch {
    // Never let a sound failure break the game.
  }
}

/** Preload the sounds used mid-gesture so the first notch has no latency. */
export function warmUp(): void {
  (['notch', 'unlock', 'combo2', 'combo3', 'win', 'deny', 'key'] as Sfx[]).forEach((n) => {
    try {
      pool(n);
    } catch {
      // ignore
    }
  });
}

const canBuzz = Platform.OS === 'ios' || Platform.OS === 'android';

export const buzz = {
  notch(): void {
    if (canBuzz && getProgress().settings.haptics) Haptics.selectionAsync().catch(() => {});
  },
  unlock(spokes: number): void {
    if (!canBuzz || !getProgress().settings.haptics) return;
    const style = spokes >= 3 ? Haptics.ImpactFeedbackStyle.Heavy : spokes === 2 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(style).catch(() => {});
  },
  win(): void {
    if (canBuzz && getProgress().settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  deny(): void {
    if (canBuzz && getProgress().settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  tap(): void {
    if (canBuzz && getProgress().settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
};

export function notchFeedback(i: number): void {
  play('notch', 0.55 + (i % 3) * 0.1);
  buzz.notch();
}
