import { PRODUCTS } from './config';
import { addCoins, update } from '../state/store';

/** Web preview: purchases succeed instantly so the shop can be exercised. */
export interface ShopItem {
  id: string;
  coins?: number;
  price: string | null;
}

export async function initPurchases(): Promise<void> {}

export function shopItems(): ShopItem[] {
  return [
    { id: PRODUCTS.removeAds, price: '4,99 $' },
    { id: PRODUCTS.coins[0].id, coins: 600, price: '1,99 $' },
    { id: PRODUCTS.coins[1].id, coins: 1500, price: '4,49 $' },
    { id: PRODUCTS.coins[2].id, coins: 4000, price: '9,99 $' },
  ];
}

export async function buy(id: string): Promise<'ok' | 'cancelled' | 'failed'> {
  if (id === PRODUCTS.removeAds) update((p) => ({ ...p, adsRemoved: true }));
  const pack = PRODUCTS.coins.find((c) => c.id === id);
  if (pack) addCoins(pack.coins);
  return 'ok';
}

export async function restore(): Promise<boolean> {
  return false;
}
