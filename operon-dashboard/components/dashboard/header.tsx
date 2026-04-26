'use client';

import { useState, useRef, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSidebarStore } from '@/stores/sidebar';
import { useLanguageStore } from '@/stores/language';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Language } from '@/types/api';

const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'tc', label: '繁中' },
  { value: 'sc', label: '简中' },
  { value: 'ko', label: '한국어' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'th', label: 'ไทย' },
];

interface HeaderProps {
  announcement?: string;
}

export function Header({ announcement }: HeaderProps) {
  const { toggle } = useSidebarStore();
  const { language: lang, setLanguage: setLang } = useLanguageStore();
  const { t } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-[rgba(147,197,253,0.08)] bg-[rgba(2,5,13,0.72)] backdrop-blur-md">
      {announcement && (
        <div className="border-b border-[rgba(147,197,253,0.10)] bg-[rgba(59,130,246,0.06)] px-4 py-2 text-center text-xs text-ice">
          {announcement}
        </div>
      )}
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        <div className="lg:hidden" />
        <div className="hidden lg:block" />

        <div className="flex items-center gap-3">
          {/* Language selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              aria-label={t('header.language')}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              onClick={() => setLangOpen((p) => !p)}
              className="flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] px-3 py-2 font-mono text-[11px] font-medium tracking-widest uppercase text-t2 transition-colors hover:border-[rgba(147,197,253,0.32)] hover:text-ice focus-visible:outline focus-visible:outline-2 focus-visible:outline-ice focus-visible:outline-offset-2 cursor-pointer min-h-[40px]"
            >
              {languages.find((l) => l.value === lang)?.label}
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M0 0l5 6 5-6z" fill="currentColor" />
              </svg>
            </button>
            {langOpen && (
              <div role="listbox" aria-label={t('header.language')} className="absolute right-0 top-full mt-1 w-28 overflow-hidden rounded-xl border border-[rgba(147,197,253,0.18)] bg-[rgba(10,15,28,0.96)] backdrop-blur-md shadow-[0_10px_30px_-8px_rgba(2,5,13,0.8)]">
                {languages.map((l) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={lang === l.value}
                    key={l.value}
                    onClick={() => {
                      setLang(l.value);
                      setLangOpen(false);
                    }}
                    className={`block w-full px-3 py-2.5 text-left text-xs transition-colors cursor-pointer min-h-[40px] ${
                      lang === l.value
                        ? 'bg-[rgba(59,130,246,0.15)] text-ice'
                        : 'text-t2 hover:bg-[rgba(147,197,253,0.05)] hover:text-t1'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Wallet connect */}
          <ConnectButton
            chainStatus="icon"
            accountStatus="address"
            showBalance={false}
          />
        </div>
      </div>
    </header>
  );
}
