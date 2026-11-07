import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface Extra {
  ads?: {
    /** When true (or while ad unit ids are missing in a dev build), Google's test units are used. */
    useTestIds?: boolean;
    ios?: { rewarded?: string; interstitial?: string };
    android?: { rewarded?: string; interstitial?: string };
  };
  revenuecat?: { ios?: string; android?: string };
  /** Site base URL (French pages at the root, English under en/), contact mailto, share link. */
  links?: { site?: string; contact?: string; share?: string };
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const SITE = (extra.links?.site ?? 'https://sohi666.github.io/rotor/').replace(/\/?$/, '/');

export const LINKS = {
  site: SITE,
  contact: extra.links?.contact ?? '',
  /** Appended to share cards when set (store page or landing page). */
  share: extra.links?.share ?? '',
};

/** Privacy policy / terms / support page in the player's language. */
export function siteLink(page: 'privacy' | 'terms' | 'support', lang: 'fr' | 'en'): string {
  const base = lang === 'en' ? `${SITE}en/` : SITE;
  return page === 'support' ? base : `${base}${page}.html`;
}

export function adUnits(): { rewarded: string; interstitial: string } | null {
  const units = Platform.OS === 'ios' ? extra.ads?.ios : extra.ads?.android;
  if (units?.rewarded && units?.interstitial && !extra.ads?.useTestIds) {
    return { rewarded: units.rewarded, interstitial: units.interstitial };
  }
  if (extra.ads?.useTestIds || __DEV__) return { rewarded: 'TEST', interstitial: 'TEST' };
  return null;
}

export function revenueCatKey(): string | null {
  const key = Platform.OS === 'ios' ? extra.revenuecat?.ios : extra.revenuecat?.android;
  return key || null;
}

/**
 * In-app purchases exist only when RevenueCat is configured. Without it (1.0 ships free)
 * the shop, Remove Ads and Restore purchases are hidden everywhere, so no store reviewer
 * ever meets a purchase button that can't work.
 */
export function storeEnabled(): boolean {
  return revenueCatKey() !== null;
}

/** Store product identifiers (create the same ids in App Store Connect and Play Console). */
export const PRODUCTS = {
  removeAds: 'rotor_remove_ads',
  coins: [
    { id: 'rotor_coins_600', coins: 600 },
    { id: 'rotor_coins_1500', coins: 1500 },
    { id: 'rotor_coins_4000', coins: 4000 },
  ],
} as const;

export const ENTITLEMENT_NO_ADS = 'no_ads';
