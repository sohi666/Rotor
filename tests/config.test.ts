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
});
