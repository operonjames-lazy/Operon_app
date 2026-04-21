import type { Locale } from '@rainbow-me/rainbowkit';
import type { Language } from '@/types/api';

/**
 * Map the app's `Language` codes onto RainbowKit's supported `Locale`
 * codes. R5-BUG-08: without this, `<RainbowKitProvider>` defaulted to
 * the browser's `navigator.language`, so the "Connect Wallet" button
 * (and the modal that opens from it) stayed in the user's OS language
 * even after the in-app language picker was changed. All six app
 * languages are natively supported by RainbowKit 2.2.x
 * (see node_modules/@rainbow-me/rainbowkit/dist/locales/index.d.ts).
 */
const MAP: Record<Language, Locale> = {
  en: 'en-US',
  tc: 'zh-TW',
  sc: 'zh-CN',
  ko: 'ko',
  vi: 'vi',
  th: 'th',
};

export function rainbowLocaleFor(lang: Language): Locale {
  return MAP[lang] ?? 'en-US';
}
