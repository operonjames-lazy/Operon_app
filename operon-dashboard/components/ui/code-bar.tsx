'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface CodeBarProps {
  code: string;
  label?: string;
}

function useCopyFeedback() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API not available */
    }
  }, []);

  return { copied, copy };
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 3H4.5A1.5 1.5 0 003 4.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 9.5L10 6.5M10 3a2 2 0 110 4 2 2 0 010-4zM6 8a2 2 0 110-4 2 2 0 010 4zM10 11a2 2 0 110 4 2 2 0 010-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6.5 9.5L9.5 6.5M7 11L5.5 12.5a2.121 2.121 0 01-3-3L4 8m4-3l1.5-1.5a2.121 2.121 0 013 3L11 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CodeBar({ code, label }: CodeBarProps) {
  const { copied: codeCopied, copy: copyCode } = useCopyFeedback();
  const { copied: linkCopied, copy: copyLink } = useCopyFeedback();
  const { t } = useTranslation();

  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/sale?ref=${code}`
    : `https://app.operon.network/sale?ref=${code}`;

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: t('code.shareTitle'),
          text: t('code.shareText', { code }),
          url: referralUrl,
        });
      } catch {
        /* user cancelled or share not supported */
      }
    } else {
      await copyLink(referralUrl);
    }
  };

  return (
    <div className="w-full">
      {label && <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-t3">{label}</p>}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-border bg-bg px-3 sm:px-4 py-2.5 min-w-0 min-h-[44px]">
          <span className="flex-1 font-mono text-sm text-t1 tracking-wide truncate">{code}</span>
        </div>
        <button
          onClick={() => copyCode(code)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-t2 transition-colors hover:bg-card-hover hover:text-t1 cursor-pointer"
          title={t('code.copyCode')}
        >
          {codeCopied ? (
            <span className="text-xs text-green font-medium">OK</span>
          ) : (
            <CopyIcon />
          )}
        </button>
        <button
          onClick={handleShare}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-t2 transition-colors hover:bg-card-hover hover:text-t1 cursor-pointer"
          title={t('code.share')}
        >
          <ShareIcon />
        </button>
        <button
          onClick={() => copyLink(referralUrl)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-t2 transition-colors hover:bg-card-hover hover:text-t1 cursor-pointer"
          title={t('code.copyLink')}
        >
          {linkCopied ? (
            <span className="text-xs text-green font-medium">OK</span>
          ) : (
            <LinkIcon />
          )}
        </button>
      </div>
    </div>
  );
}
