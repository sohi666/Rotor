import { Platform } from 'react-native';
import mobileAds, {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { adUnits } from './config';
import { getProgress, update } from '../state/store';
import { track } from './analytics';

/**
 * Fair ad rules (from the design brief):
 * - Rewarded videos are always opt-in, and the reward is granted if the ad fails to load or show.
 * - Interstitials only at a natural break (after "Next level"), never before level 35,
 *   at most once every 3 levels and 2 minutes, never after "Remove ads".
 */
const FIRST_INTERSTITIAL_LEVEL = 36;
const LEVELS_BETWEEN = 3;
const MIN_GAP_MS = 120_000;

let ready = false;
let rewarded: RewardedAd | null = null;
let rewardedLoaded = false;
let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;

function units() {
  const u = adUnits();
  if (!u) return null;
  return {
    rewarded: u.rewarded === 'TEST' ? TestIds.REWARDED : u.rewarded,
    interstitial: u.interstitial === 'TEST' ? TestIds.INTERSTITIAL : u.interstitial,
  };
}

export const adsAvailable = (): boolean => units() !== null;

export async function initAds(): Promise<void> {
  if (ready || !units()) return;
  try {
    await AdsConsent.requestInfoUpdate();
    await AdsConsent.loadAndShowConsentFormIfRequired();
    const info = await AdsConsent.getConsentInfo();
    if (!info.canRequestAds) return;
    if (Platform.OS === 'ios') await requestTrackingPermissionsAsync().catch(() => undefined);
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.G, // keeps ads suitable for the App Store 4+ rating
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
    ready = true;
    loadRewarded();
    loadInterstitial();
  } catch (e) {
    track('ads_init_failed', { message: String(e) });
  }
}

function loadRewarded(): void {
  const u = units();
  if (!ready || !u) return;
  rewardedLoaded = false;
  rewarded = RewardedAd.createForAdRequest(u.rewarded);
  rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewardedLoaded = true;
  });
  rewarded.addAdEventListener(AdEventType.ERROR, () => {
    rewardedLoaded = false;
  });
  rewarded.load();
}

function loadInterstitial(): void {
  const u = units();
  if (!ready || !u) return;
  interstitialLoaded = false;
  interstitial = InterstitialAd.createForAdRequest(u.interstitial);
  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });
  interstitial.addAdEventListener(AdEventType.ERROR, () => {
    interstitialLoaded = false;
  });
  interstitial.load();
}

/**
 * Show an opt-in rewarded video. Resolves true when the player should get the reward:
 * they watched it, or the ad couldn't be shown (we never make players pay for our failures).
 * Resolves false only when they closed the video early.
 */
export function showRewarded(placement: string): Promise<boolean> {
  track('rewarded_requested', { placement });
  if (!ready || !rewarded || !rewardedLoaded) {
    loadRewarded();
    track('rewarded_granted_without_ad', { placement });
    return Promise.resolve(true);
  }
  const ad = rewarded;
  return new Promise((resolve) => {
    let earned = false;
    let settled = false;
    const done = (granted: boolean) => {
      if (settled) return;
      settled = true;
      unsubs.forEach((u) => u());
      loadRewarded();
      track(granted ? 'rewarded_granted' : 'rewarded_closed_early', { placement });
      resolve(granted);
    };
    const unsubs = [
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => done(earned)),
      ad.addAdEventListener(AdEventType.ERROR, () => done(true)),
    ];
    ad.show().catch(() => done(true));
  });
}

/** Called when the player taps "Next level" after winning campaign level `levelNumber`. */
export async function maybeShowInterstitial(levelNumber: number): Promise<void> {
  const p = getProgress();
  if (p.adsRemoved || levelNumber < FIRST_INTERSTITIAL_LEVEL) return;
  if (p.ads.levelsSince < LEVELS_BETWEEN || Date.now() - p.ads.lastShownAt < MIN_GAP_MS) return;
  if (!ready || !interstitial || !interstitialLoaded) {
    loadInterstitial();
    return;
  }
  const ad = interstitial;
  await new Promise<void>((resolve) => {
    const unsubs = [
      ad.addAdEventListener(AdEventType.CLOSED, () => finish()),
      ad.addAdEventListener(AdEventType.ERROR, () => finish()),
    ];
    function finish() {
      unsubs.forEach((u) => u());
      resolve();
    }
    ad.show().catch(() => finish());
  });
  update((s) => ({ ...s, ads: { levelsSince: 0, lastShownAt: Date.now() } }));
  track('interstitial_shown', { level: levelNumber });
  loadInterstitial();
}
