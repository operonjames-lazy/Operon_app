'use client';

import { useCallback } from 'react';
import { useLanguageStore } from '@/stores/language';
import { translations, type TranslationKey } from './translations';

/**
 * Client-side translation hook.
 *
 * Usage:
 *   const { t, locale } = useTranslation();
 *   t('error.INSUFFICIENT_BALANCE', { token: 'USDC', required: '500', available: '200' })
 */
export function useTranslation() {
  const locale = useLanguageStore((s) => s.language);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const dict = translations[locale] ?? translations.en;
      let value: string = (dict as Record<string, string>)[key] ?? (translations.en as Record<string, string>)[key] ?? key;

      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          value = value.replace(
            new RegExp(`\\{${paramKey}\\}`, 'g'),
            String(paramValue),
          );
        }
      }

      return value;
    },
    [locale],
  );

  return { t, locale } as const;
}
