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

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: detectBrowserLanguage(),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'operon-language',
      // Only rehydrate if there's a saved value — otherwise use browser detection
      // The persist middleware automatically uses the stored value if it exists,
      // and falls back to the initial state (detectBrowserLanguage) on first visit.
    },
  ),
);
