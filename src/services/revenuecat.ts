import { Platform } from 'react-native';
import Purchases, { type PurchasesStoreProduct } from 'react-native-purchases';
import { ENTITLEMENT_NO_ADS, PRODUCTS, revenueCatKey } from './config';
import { addCoins, update } from '../state/store';
import { track } from './analytics';

export interface ShopItem {
  id: string;
  coins?: number;
  price: string | null;
}

let configured = false;
const products = new Map<string, PurchasesStoreProduct>();

export async function initPurchases(): Promise<void> {
  const key = revenueCatKey();
  if (configured || !key || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
  try {
    Purchases.configure({ apiKey: key });
    configured = true;
    const info = await Purchases.getCustomerInfo();
    syncEntitlements(!!info.entitlements.active[ENTITLEMENT_NO_ADS]);
    const ids = [PRODUCTS.removeAds, ...PRODUCTS.coins.map((c) => c.id)];
    const found = await Purchases.getProducts(ids, Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
    found.forEach((p) => products.set(p.identifier, p));
  } catch (e) {
    track('purchases_init_failed', { message: String(e) });
  }
}

function syncEntitlements(noAds: boolean): void {
  if (noAds) update((p) => (p.adsRemoved ? p : { ...p, adsRemoved: true }));
}

export function shopItems(): ShopItem[] {
  return [
    { id: PRODUCTS.removeAds, price: products.get(PRODUCTS.removeAds)?.priceString ?? null },
    ...PRODUCTS.coins.map((c) => ({ id: c.id, coins: c.coins, price: products.get(c.id)?.priceString ?? null })),
  ];
}

/** Returns 'ok', 'cancelled' or 'failed'. Coins are credited locally once the store confirms. */
export async function buy(id: string): Promise<'ok' | 'cancelled' | 'failed'> {
  const product = products.get(id);
  if (!configured || !product) return 'failed';
  try {
    const res = await Purchases.purchaseStoreProduct(product);
    if (id === PRODUCTS.removeAds) syncEntitlements(true);
    else {
      const pack = PRODUCTS.coins.find((c) => c.id === id);
      if (pack) addCoins(pack.coins);
    }
    track('purchase', { id, tx: res.transaction?.transactionIdentifier ?? '' });
    return 'ok';
  } catch (e) {
    const cancelled = !!(e as { userCancelled?: boolean }).userCancelled;
    track(cancelled ? 'purchase_cancelled' : 'purchase_failed', { id });
    return cancelled ? 'cancelled' : 'failed';
  }
}

export async function restore(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.restorePurchases();
    const noAds = !!info.entitlements.active[ENTITLEMENT_NO_ADS];
    syncEntitlements(noAds);
    return noAds;
  } catch {
    return false;
  }
}
