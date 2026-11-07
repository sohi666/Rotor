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
const isAndroid = Platform.OS === 'android';
const androidApi = isAndroid ? Number(Platform.Version) : 0;
const on = () => canBuzz && getProgress().settings.haptics;
const quiet = (p: Promise<void>) => p.catch(() => {});

/**
 * Android: expo-haptics' selection/impact calls drive the vibration motor directly
 * (a 50 ms pulse), which budget motors turn into a buzz. The system haptic constants
 * (performHapticFeedback) are short ticks tuned per device by the manufacturer and follow
 * the user's system vibration-intensity setting. Confirm/Reject need Android 11 (API 30).
 */
const A = Haptics.AndroidHaptics;
function androidHaptic(type: Haptics.AndroidHaptics, minApi = 0, fallback?: () => Promise<void>): void {
  if (androidApi >= minApi) quiet(Haptics.performAndroidHapticsAsync(type));
  else if (fallback) quiet(fallback());
}

/** Fast spins cross several notches per frame; one tick per 45 ms is plenty and keeps motors from blurring into a buzz. */
const NOTCH_MIN_GAP_MS = 45;
let lastNotchAt = 0;

export const buzz = {
  notch(): void {
    if (!on()) return;
    const now = Date.now();
    if (now - lastNotchAt < NOTCH_MIN_GAP_MS) return;
    lastNotchAt = now;
    if (isAndroid) androidHaptic(A.Clock_Tick);
    else quiet(Haptics.selectionAsync());
  },
  unlock(spokes: number): void {
    if (!on()) return;
    if (isAndroid) {
      androidHaptic(spokes >= 2 ? A.Long_Press : A.Confirm, spokes >= 2 ? 0 : 30, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      return;
    }
    const style = spokes >= 3 ? Haptics.ImpactFeedbackStyle.Heavy : spokes === 2 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
    quiet(Haptics.impactAsync(style));
  },
  win(): void {
    if (!on()) return;
    if (isAndroid) androidHaptic(A.Confirm, 30, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    else quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  deny(): void {
    if (!on()) return;
    if (isAndroid) androidHaptic(A.Reject, 30, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    else quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  tap(): void {
    if (!on()) return;
    if (isAndroid) androidHaptic(A.Virtual_Key);
    else quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
};

export function notchFeedback(i: number): void {
  play('notch', 0.55 + (i % 3) * 0.1);
  buzz.notch();
}
