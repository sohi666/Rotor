import { NativeModules } from 'react-native';
import type { ShopItem } from './revenuecat';

export type { ShopItem };

/**
 * Purchases facade. The RevenueCat implementation lives in ./revenuecat and is only loaded
 * when its native module is linked. Rotor 1.0 for iOS ships without it
 * (react-native.config.js): RevenueCat links AdServices and looks up the App Tracking
 * Transparency status, and App Review then asked for an ATT prompt the game never needs.
 * Without the module the shop is empty and every call is a harmless no-op.
 */
type RevenueCat = typeof import('./revenuecat');

let impl: RevenueCat | null | undefined;
function revenueCat(): RevenueCat | null {
  if (impl === undefined) impl = NativeModules.RNPurchases ? (require('./revenuecat') as RevenueCat) : null;
  return impl;
}

export async function initPurchases(): Promise<void> {
  await revenueCat()?.initPurchases();
}

export function shopItems(): ShopItem[] {
  return revenueCat()?.shopItems() ?? [];
}

export async function buy(id: string): Promise<'ok' | 'cancelled' | 'failed'> {
  return (await revenueCat()?.buy(id)) ?? 'failed';
}

export async function restore(): Promise<boolean> {
  return (await revenueCat()?.restore()) ?? false;
}
