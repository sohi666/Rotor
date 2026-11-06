/** Web preview: no ad SDK. Rewarded offers are granted immediately so every flow can be tested. */
export const adsAvailable = (): boolean => true;
export async function initAds(): Promise<void> {}
export function showRewarded(_placement: string): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(true), 400));
}
export async function maybeShowInterstitial(_levelNumber: number): Promise<void> {}
