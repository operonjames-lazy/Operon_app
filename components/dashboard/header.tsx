'use client';

import { useState, useRef, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSidebarStore } from '@/stores/sidebar';
import { useLanguageStore } from '@/stores/language';
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
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
      {announcement && (
        <div className="border-b border-green-border bg-green-bg px-4 py-2 text-center text-xs text-green">
          {announcement}
        </div>
      )}
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        {/* Spacer on mobile (hamburger removed — bottom nav handles all navigation) */}
        <div className="lg:hidden" />

        {/* Spacer on desktop */}
        <div className="hidden lg:block" />

        <div className="flex items-center gap-3">
          {/* Language selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setLangOpen((p) => !p)}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium text-t2 transition-colors hover:bg-card-hover hover:text-t1 cursor-pointer min-h-[44px]"
            >
              {languages.find((l) => l.value === lang)?.label}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-1 w-20 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                {languages.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => {
                      setLang(l.value);
                      setLangOpen(false);
                    }}
                    className={`block w-full px-3 py-2.5 text-left text-xs transition-colors cursor-pointer min-h-[44px] ${
                      lang === l.value
                        ? 'bg-green-bg text-green'
                        : 'text-t2 hover:bg-card-hover hover:text-t1'
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
