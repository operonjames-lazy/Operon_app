'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/useTranslation';

// ═══════════════════════════════════════════════════════════════════════
// TODO(james): URLs still owed for the items marked `#` below. UI is
// intentionally kept as-is so layout is final — only the hrefs need
// filling in. Before mainnet launch, replace every `#` with a real URL:
//
//   DOWNLOADS
//     - pitchManual      → PDF of partner pitch deck / training manual
//     - brandAssets      → zip of logo / brand kit (Operon_Brand_*.zip)
//     - termsConditions  → EPP T&Cs PDF (v1.0)
//
//   LINKS
//     - whitepaper       → /whitepaper.pdf or https://operon.network/whitepaper
//     - faq              → https://operon.network/faq (page doesn't exist yet)
//     - medium           → https://medium.com/@operon (or whatever the handle is)
//
//   COMMUNITY
//     - Telegram         → https://t.me/operon (or whatever the group link is)
//     - Discord          → https://discord.gg/... (or remove if no Discord)
//     - X (Twitter)      → https://x.com/operon (verify handle)
//
// website link is already real: https://operon.network
// bridge links at the bottom are already real (Arbitrum + Celer).
// ═══════════════════════════════════════════════════════════════════════

const DOWNLOADS = [
  { key: 'pitchManual', icon: '📄', href: '#' }, // TODO: owed
  { key: 'brandAssets', icon: '🎨', href: '#' }, // TODO: owed
  { key: 'termsConditions', icon: '📋', href: '#' }, // TODO: owed
];

const LINKS = [
  { key: 'website', href: 'https://operon.network', icon: '🌐' },
  { key: 'whitepaper', href: '#', icon: '📖' }, // TODO: owed
  { key: 'faq', href: '#', icon: '❓' }, // TODO: owed
  { key: 'medium', href: '#', icon: '✍️' }, // TODO: owed
];

const COMMUNITY = [
  { name: 'Telegram', href: '#', icon: '💬' }, // TODO: owed
  { name: 'Discord', href: '#', icon: '🎮' }, // TODO: owed
  { name: 'X (Twitter)', href: '#', icon: '🐦' }, // TODO: owed
];

export default function ResourcesPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-fade-in">
      {/* Partner Materials */}
      <Card title={t('resources.partnerMaterials')}>
        <div className="space-y-3">
          {DOWNLOADS.map(item => (
            <a
              key={item.key}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-card-hover transition-colors min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm text-t1">{t(`resources.${item.key}`)}</span>
              </div>
              <span className="text-t3 text-xs">{t('resources.download')}</span>
            </a>
          ))}
        </div>
      </Card>

      {/* Useful Links */}
      <Card title={t('resources.usefulLinks')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LINKS.map(link => (
            <a
              key={link.key}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-card-hover transition-colors min-h-[44px]"
            >
              <span>{link.icon}</span>
              <span className="text-sm text-t1">{t(`resources.${link.key}`)}</span>
            </a>
          ))}
        </div>
      </Card>

      {/* Community */}
      <Card title={t('resources.community')}>
        <div className="flex gap-3">
          {COMMUNITY.map(social => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-card-hover transition-colors"
            >
              <span className="text-2xl">{social.icon}</span>
              <span className="text-xs text-t2">{social.name}</span>
            </a>
          ))}
        </div>
      </Card>

      {/* Compliance */}
      <Card title={t('resources.compliance')}>
        <div className="space-y-3 text-sm text-t3">
          <p>{t('resources.complianceNote1')}</p>
          <p>{t('resources.complianceNote2')}</p>
          <p>{t('resources.complianceNote3')}</p>
          <p>{t('resources.complianceNote4')}</p>
        </div>
      </Card>

      {/* Bridge Guides */}
      <Card title={t('resources.bridgeGuides')}>
        <div className="space-y-3">
          <a
            href="https://bridge.arbitrum.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-card-hover transition-colors"
          >
            <span className="text-sm text-t1">{t('resources.bridgeArbitrum')}</span>
            <span className="text-ice text-xs">→</span>
          </a>
          <a
            href="https://cbridge.celer.network"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-card-hover transition-colors"
          >
            <span className="text-sm text-t1">{t('resources.bridgeBsc')}</span>
            <span className="text-ice text-xs">→</span>
          </a>
        </div>
      </Card>
    </div>
  );
}
