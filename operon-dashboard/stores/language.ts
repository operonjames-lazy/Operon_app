import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Language } from '@/types/api';

/**
 * Detects the user's preferred language from the browser.
 * Maps browser locale codes to our supported Language type.
 * Falls back to 'en' for unsupported locales.
 */
function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';

  // Check navigator.language and navigator.languages
  const locales = [
    navigator.language,
    ...(navigator.languages || []),
  ];

  for (const locale of locales) {
    const lower = locale.toLowerCase();

    // Traditional Chinese
    if (lower.startsWith('zh-tw') || lower.startsWith('zh-hant') || lower.startsWith('zh-hk') || lower.startsWith('zh-mo')) {
      return 'tc';
    }
    // Simplified Chinese
    if (lower.startsWith('zh-cn') || lower.startsWith('zh-hans') || lower.startsWith('zh-sg') || lower === 'zh') {
      return 'sc';
    }
    // Korean
    if (lower.startsWith('ko')) return 'ko';
    // Vietnamese
    if (lower.startsWith('vi')) return 'vi';
    // Thai
    if (lower.startsWith('th')) return 'th';
    // English
    if (lower.startsWith('en')) return 'en';
  }

  return 'en';
}

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

// R2: initial state is SSR-stable ('en') so server render and first
// client render match. `detectBrowserLanguage()` runs only post-mount
// via the `onRehydrateStorage` hook below, after zustand's persist
// middleware has had a chance to restore any saved preference. The
// previous shape — which called `detectBrowserLanguage()` eagerly in
// the initial-state factory — evaluated `navigator.language` on the
// client module load but not on the server, producing a guaranteed
// hydration mismatch for every translated string on every 'use client'
// page for any non-English browser. React's contract forbids that, and
// Sentry noise from the mismatch warnings hid real bugs.
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'operon-language',
      onRehydrateStorage: () => (state) => {
        // After persist rehydrates: if nothing was stored, fall back to
        // browser detection. `_hasHydrated` would otherwise require the
        // caller to gate; doing the fallback here keeps the public API
        // simple — every consumer gets a stable string.
        if (state && state.language === 'en' && typeof navigator !== 'undefined') {
          const detected = detectBrowserLanguage();
          if (detected !== 'en') state.setLanguage(detected);
        }
      },
    },
  ),
);
