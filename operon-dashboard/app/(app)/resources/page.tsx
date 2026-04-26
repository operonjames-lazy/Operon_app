'use client';

import { Card } from '@/components/ui/card';
import { useTranslation } from '@/lib/i18n/useTranslation';

// ═══════════════════════════════════════════════════════════════════════
// TODO(james): URLs still owed for the items marked `#` below. Until
// real URLs land, these render as disabled "Coming soon" tiles instead
// of dead anchors that scroll-to-top.
//
//   DOWNLOADS
//     - pitchManual      → PDF of partner pitch deck / training manual
//     - brandAssets      → zip of logo / brand kit (Operon_Brand_*.zip)
//     - termsConditions  → EPP T&Cs PDF (v1.0)
//
//   LINKS
//     - whitepaper       → /whitepaper.pdf or https://operon.network/whitepaper
//     - faq              → https://operon.network/faq
//     - medium           → https://medium.com/@operon
//
//   COMMUNITY
//     - Telegram         → https://t.me/operon
//     - Discord          → https://discord.gg/...
//     - X (Twitter)      → https://x.com/operon
//
// website link is already real: https://operon.network
// bridge links at the bottom are already real (Arbitrum + Celer).
// ═══════════════════════════════════════════════════════════════════════

interface ResourceItem {
  key: string;
  href: string;
  icon: string;
}

const DOWNLOADS: ResourceItem[] = [
  { key: 'pitchManual', icon: '📄', href: '#' },
  { key: 'brandAssets', icon: '🎨', href: '#' },
  { key: 'termsConditions', icon: '📋', href: '#' },
];

const LINKS: ResourceItem[] = [
  { key: 'website', href: 'https://operon.network', icon: '🌐' },
  { key: 'whitepaper', href: '#', icon: '📖' },
  { key: 'faq', href: 'https://operon.network/faq/', icon: '❓' },
  { key: 'medium', href: '#', icon: '✍️' },
];

const COMMUNITY: ResourceItem[] = [
  { key: 'telegram', href: '#', icon: '💬' },
  { key: 'discord', href: '#', icon: '🎮' },
  { key: 'twitter', href: '#', icon: '🐦' },
];

const COMMUNITY_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  twitter: 'X (Twitter)',
};

function isDead(href: string) {
  return href === '#' || href === '';
}

const baseTile =
  'flex items-center justify-between p-3 rounded-lg border min-h-[44px] transition-colors';
const liveTile =
  baseTile +
  ' border-[rgba(147,197,253,0.10)] bg-[rgba(8,12,24,0.5)] hover:border-[rgba(147,197,253,0.25)] hover:bg-[rgba(8,12,24,0.85)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ice focus-visible:outline-offset-2';
const deadTile =
  baseTile +
  ' border-[rgba(147,197,253,0.06)] bg-[rgba(8,12,24,0.3)] opacity-60 cursor-not-allowed';

const baseGridTile =
  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors';
const liveGridTile =
  baseGridTile +
  ' border-[rgba(147,197,253,0.10)] bg-[rgba(8,12,24,0.5)] hover:border-[rgba(147,197,253,0.25)] hover:bg-[rgba(8,12,24,0.85)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ice focus-visible:outline-offset-2';
const deadGridTile =
  baseGridTile +
  ' border-[rgba(147,197,253,0.06)] bg-[rgba(8,12,24,0.3)] opacity-60 cursor-not-allowed';

export default function ResourcesPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-fade-in">
      {/* Partner Materials */}
      <Card title={t('resources.partnerMaterials')}>
        <div className="space-y-3">
          {DOWNLOADS.map((item) => {
            const dead = isDead(item.href);
            const label = t(`resources.${item.key}`);
            const inner = (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm text-t1">{label}</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-t3">
                  {dead ? t('nav.comingSoon') : t('resources.download')}
                </span>
              </>
            );
            return dead ? (
              <div key={item.key} className={deadTile} aria-disabled="true">
                {inner}
              </div>
            ) : (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={liveTile}
              >
                {inner}
              </a>
            );
          })}
        </div>
      </Card>

      {/* Useful Links */}
      <Card title={t('resources.usefulLinks')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LINKS.map((link) => {
            const dead = isDead(link.href);
            const label = t(`resources.${link.key}`);
            const inner = (
              <>
                <span>{link.icon}</span>
                <span className="text-sm text-t1">{label}</span>
                {dead && (
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-t4">
                    {t('nav.comingSoon')}
                  </span>
                )}
              </>
            );
            const tile = `flex items-center gap-2 p-3 rounded-lg border min-h-[44px] transition-colors ${
              dead
                ? 'border-[rgba(147,197,253,0.06)] bg-[rgba(8,12,24,0.3)] opacity-60 cursor-not-allowed'
                : 'border-[rgba(147,197,253,0.10)] bg-[rgba(8,12,24,0.5)] hover:border-[rgba(147,197,253,0.25)] hover:bg-[rgba(8,12,24,0.85)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ice focus-visible:outline-offset-2'
            }`;
            return dead ? (
              <div key={link.key} className={tile} aria-disabled="true">
                {inner}
              </div>
            ) : (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={tile}
              >
                {inner}
              </a>
            );
          })}
        </div>
      </Card>

      {/* Community */}
      <Card title={t('resources.community')}>
        <div className="flex gap-3">
          {COMMUNITY.map((social) => {
            const dead = isDead(social.href);
            const label = COMMUNITY_LABELS[social.key] ?? social.key;
            const inner = (
              <>
                <span className="text-2xl">{social.icon}</span>
                <span className="text-xs text-t2">{label}</span>
                {dead && (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-t4 mt-0.5">
                    {t('nav.comingSoon')}
                  </span>
                )}
              </>
            );
            return dead ? (
              <div
                key={social.key}
                className={`flex-1 ${deadGridTile}`}
                aria-disabled="true"
              >
                {inner}
              </div>
            ) : (
              <a
                key={social.key}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-1 ${liveGridTile}`}
              >
                {inner}
              </a>
            );
          })}
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
            className={liveTile}
          >
            <span className="text-sm text-t1">{t('resources.bridgeArbitrum')}</span>
            <span className="text-ice text-xs">→</span>
          </a>
          <a
            href="https://cbridge.celer.network"
            target="_blank"
            rel="noopener noreferrer"
            className={liveTile}
          >
            <span className="text-sm text-t1">{t('resources.bridgeBsc')}</span>
            <span className="text-ice text-xs">→</span>
          </a>
        </div>
      </Card>
    </div>
  );
}
