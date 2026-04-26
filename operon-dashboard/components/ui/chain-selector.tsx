'use client';

import type { Chain } from '@/types/api';

interface ChainSelectorProps {
  value: Chain;
  onChange: (chain: Chain) => void;
}

function ArbitrumIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 4L6 12h2.5l1.5-4 1.5 4H14L10 4z" fill="currentColor" />
    </svg>
  );
}

function BnbIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 4l2 2-2 2-2-2 2-2zm-4 4l2 2-2 2-2-2 2-2zm8 0l2 2-2 2-2-2 2-2zm-4 4l2 2-2 2-2-2 2-2z" fill="currentColor" />
    </svg>
  );
}

const chains: { id: Chain; label: string; icon: React.ReactNode }[] = [
  { id: 'arbitrum', label: 'Arbitrum', icon: <ArbitrumIcon /> },
  { id: 'bsc', label: 'BNB Chain', icon: <BnbIcon /> },
];

export function ChainSelector({ value, onChange }: ChainSelectorProps) {
  return (
    <div className="flex gap-2">
      {chains.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer min-h-[44px] ${
              active
                ? 'border-[rgba(147,197,253,0.45)] bg-[rgba(59,130,246,0.12)] text-ice shadow-[0_0_20px_-8px_rgba(59,130,246,0.5),inset_0_1px_0_rgba(147,197,253,0.10)]'
                : 'border-[rgba(147,197,253,0.10)] bg-[rgba(8,12,24,0.7)] text-t2 hover:border-[rgba(147,197,253,0.18)] hover:text-t1'
            }`}
          >
            {c.icon}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
