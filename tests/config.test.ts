import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;

describe('app.json locales', () => {
  // Top-level keys in a locale file go to BOTH platforms. iOS Info.plist keys
  // (CFBundleDisplayName, NS*UsageDescription) leaking into Android strings.xml
  // fail the release lint (ExtraTranslation), so they must sit under "ios".
  it.each(Object.entries(app.locales as Record<string, string>))('%s keeps platform keys scoped', (_lang, file) => {
    const locale = JSON.parse(readFileSync(join(root, file), 'utf8'));
    const stray = Object.keys(locale).filter((k) => k !== 'ios' && k !== 'android');
    expect(stray).toEqual([]);
  });

  // App Review reads a localized NSUserTrackingUsageDescription as "this app uses App Tracking
  // Transparency" and then rejects a build that never shows the prompt (Guideline 2.1, Nov 2026).
  // Only add it back together with the ads SDK and the ATT prompt.
  const adsLinked = (app.plugins as unknown[]).some((p) => (Array.isArray(p) ? p[0] : p) === 'react-native-google-mobile-ads');
  it.each(Object.entries(app.locales as Record<string, string>))('%s has no tracking text while ads are off', (_lang, file) => {
    const locale = JSON.parse(readFileSync(join(root, file), 'utf8'));
    if (!adsLinked) expect(locale.ios?.NSUserTrackingUsageDescription).toBeUndefined();
  });
});
