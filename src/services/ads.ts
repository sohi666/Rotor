import { TurboModuleRegistry } from 'react-native';

/**
 * Ads facade. The AdMob implementation lives in ./admob and is only loaded when the Google
 * Mobile Ads native module is linked into the binary. Rotor 1.0 ships without it
 * (react-native.config.js, package.json "expo.autolinking.exclude"), so every call here is a
 * no-op and rewarded offers stay hidden. Rewarded calls still resolve true, so a player is
 * never blocked by a missing SDK.
 */
type AdMob = typeof import('./admob');

let impl: AdMob | null | undefined;
function admob(): AdMob | null {
  if (impl === undefined) {
    // Requiring ./admob evaluates react-native-google-mobile-ads, whose specs call
    // TurboModuleRegistry.getEnforcing() and would throw without the native module.
    impl = TurboModuleRegistry.get('RNGoogleMobileAdsModule') ? (require('./admob') as AdMob) : null;
  }
  return impl;
}

export const adsAvailable = (): boolean => admob()?.adsAvailable() ?? false;

export async function initAds(): Promise<void> {
  await admob()?.initAds();
}

export function showRewarded(placement: string): Promise<boolean> {
  return admob()?.showRewarded(placement) ?? Promise.resolve(true);
}

export async function maybeShowInterstitial(levelNumber: number): Promise<void> {
  await admob()?.maybeShowInterstitial(levelNumber);
}
