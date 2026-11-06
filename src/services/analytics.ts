/**
 * Minimal analytics seam. Events are logged in development; wire a provider
 * (PostHog, Firebase) here before the Canadian soft launch to read D1/D7/D30.
 */
type Props = Record<string, string | number | boolean>;

const sinks: ((event: string, props: Props) => void)[] = [];

export function addAnalyticsSink(fn: (event: string, props: Props) => void): void {
  sinks.push(fn);
}

export function track(event: string, props: Props = {}): void {
  if (__DEV__) console.log(`[track] ${event}`, props);
  for (const s of sinks) {
    try {
      s(event, props);
    } catch {
      // analytics must never break gameplay
    }
  }
}
