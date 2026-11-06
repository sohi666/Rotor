import { useMemo } from 'react';
import { deviceLang, strings, type Lang, type Strings } from './i18n';
import { useProgress } from './state/store';

export function useLang(): Lang {
  const p = useProgress();
  return p.settings.lang ?? deviceLang();
}

export function useStrings(): Strings {
  const lang = useLang();
  return useMemo(() => strings(lang), [lang]);
}
