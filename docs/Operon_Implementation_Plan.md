# Operon Dashboard — Implementation Plan

## Competitor Integration Analysis

Before choosing our stack, here's what the successful node sale projects use and why.

### Aethir ($100M raised)
- **Sale platform:** Custom React frontend, powered by Impossible Finance infrastructure
- **Wallet:** WalletConnect + MetaMask direct injection
- **Chain:** Arbitrum only (wETH)
- **Backend:** Custom Node.js
- **NFT:** Standard ERC-721 on Arbitrum
- **Post-sale portal:** Separate app (app.aethir.com) with checker node management, staking, EcoDrop rewards
- **Indexing:** Custom event indexer
- **Lesson:** They launched the sale page and the management portal as separate apps, then had to build a "User Portal" later to unify them. We avoid this by building one app from the start.

### Sophon ($60M raised)
- **Sale platform:** Custom frontend via nodes.sophon.xyz
- **Wallet:** WalletConnect + MetaMask
- **Chain:** Ethereum mainnet (ETH)
- **NFT:** ERC-721, non-transferable for 12 months
- **Post-sale:** Guardian app (guardian.sophon.xyz) for delegation, NaaS, rewards
- **Lesson:** 12-month transfer lock enforced at contract level. Buyback programme added 14 months post-sale as the first liquidity option. We should plan buyback/secondary market strategy before sale, not after.

### XAI (Sentry Nodes)
- **Sale platform:** Custom React frontend
- **Wallet:** WalletConnect + MetaMask
- **Chain:** Arbitrum
- **Payment:** Multiple tokens (aETH, XAI, esXAI, USDC) + fiat via Crossmint
- **Referral:** Wallet address = promo code. 5% buyer discount + 15% referrer reward.
- **Claim:** On-chain via Arbiscan contract interaction (claimReferralReward function)
- **Lesson:** Fiat via Crossmint expanded their buyer base significantly. Multiple payment tokens added friction but also flexibility. We chose stablecoin-only for commission simplicity — correct trade-off.

### Fuse (Ember Nodes)
- **Sale platform:** fuse.io/node-sale
- **Management:** NodeOps console (third-party)
- **NFT:** Non-transferable for 12 months
- **Lesson:** Outsourced node management to NodeOps. For Phase 1, this could reduce our build scope if we focus on the sale + referral system and use a third-party for post-TGE node operations.

### Hyperliquid (design reference, not node sale)
- **UI:** Near-black background, pure white text, green accent (#0FCB81)
- **Wallet:** MetaMask, WalletConnect, Rabby
- **Performance:** Sub-second UI response, real-time order book
- **Lesson:** High contrast + one accent colour + extreme data density executed cleanly. Our dashboard follows this palette approach.

### Industry Standard Stack (2025-2026)

| Layer | Dominant choice | Runner-up |
|---|---|---|
| Framework | Next.js 14+ | Nuxt 3 |
| Wallet connection | RainbowKit | Dynamic, ConnectKit |
| Blockchain interaction | wagmi v2 + viem | ethers.js v6 |
| Styling | Tailwind CSS | CSS Modules |
| Smart contracts | Solidity + Hardhat | Foundry |
| Contract base | OpenZeppelin 5.x | Solmate |
| Backend | Supabase / custom Express | Firebase |
| Indexing | Alchemy webhooks | The Graph, custom |
| Hosting | Vercel | Netlify, AWS |
| Auth (social) | Dynamic / Privy | Web3Auth |

**Our choices align with the dominant path for every layer.** The only non-standard decision is using Supabase instead of a custom Express backend — this trades flexibility for speed and eliminates DevOps overhead for Phase 1.

---

## Phased Implementation Plan

### Phase 0: Foundation (Week 1-2)

**Objective:** Repo setup, tooling, design system, contract scaffolding.

| # | Task | Owner | Deps | Est. |
|---|---|---|---|---|
| 0.1 | Init Next.js project with contracts subfolder | Frontend | — | 2h |
| 0.2 | Configure Tailwind with Operon design tokens (from UI reference) | Frontend | 0.1 | 4h |
| 0.3 | Set up RainbowKit + wagmi with Arbitrum + BSC chains | Frontend | 0.1 | 4h |
| 0.4 | Set up Supabase project, initial schema migration | Backend | — | 3h |
| 0.5 | Set up Vercel deployment pipeline (preview + prod) | DevOps | 0.1 | 2h |
| 0.6 | Set up Sentry + PostHog | DevOps | 0.5 | 2h |
| 0.7 | Scaffold Solidity contracts (NodeSale, OperonNode) | Contract | — | 4h |
| 0.8 | Build sidebar + page layout shell (responsive + hamburger) | Frontend | 0.2 | 6h |
| 0.9 | Implement i18n system (EN/TC/SC) with translation hook | Frontend | 0.1 | 4h |
| 0.10 | Create component library: stat card, code bar, progress bar, collapsible card, feed item, node card | Frontend | 0.2 | 8h |

**Deliverable:** Empty dashboard shell with navigation, wallet connect, and design system. Deploys to preview URL.

---

### Phase 1A: Smart Contracts (Week 2-4)

**Objective:** Sale and NFT contracts deployed to testnets, fully tested.

| # | Task | Owner | Deps | Est. |
|---|---|---|---|---|
| 1A.1 | OperonNode.sol — ERC-721 with tier metadata, transfer lock | Contract | 0.7 | 8h |
| 1A.2 | NodeSale.sol — tiered pricing, referral code validation, per-wallet limits, USDC/USDT payment, pause, tier auto-advance | Contract | 0.7 | 16h |
| 1A.3 | Unit tests — all purchase paths (happy path, wrong chain, sold out, max wallet, invalid code, paused, insufficient balance) | Contract | 1A.2 | 12h |
| 1A.4 | Edge case tests — tier boundary (buy last node in tier), concurrent purchases, re-entrance, approval edge cases | Contract | 1A.2 | 8h |
| 1A.5 | Gas optimization — benchmark purchase(), target <250K gas | Contract | 1A.3 | 4h |
| 1A.6 | Deploy to Arbitrum Sepolia + BSC Testnet | Contract | 1A.3 | 3h |
| 1A.7 | Generate ABIs, export to frontend package via wagmi CLI | Contract | 1A.6 | 2h |
| 1A.8 | Write deployment scripts for mainnet (with multi-sig setup) | Contract | 1A.6 | 4h |
| 1A.9 | Security review prep — document all admin functions, access control, upgrade paths | Contract | 1A.2 | 4h |

**Deliverable:** Contracts on testnet. Full test suite passing. ABIs available to frontend.

**External dependency:** Professional security audit (2-4 weeks, schedule during 1A development).

---

### Phase 1B: Dashboard Frontend (Week 2-5)

**Objective:** All 5 dashboard pages functional with testnet integration.

| # | Task | Owner | Deps | Est. |
|---|---|---|---|---|
| **Home page** | | | | |
| 1B.1 | Stat tiles (nodes owned, daily emission, network) with links | Frontend | 0.10 | 4h |
| 1B.2 | Sale status card with tier progress bar, remaining count, CTA | Frontend | 0.10 | 4h |
| 1B.3 | Referral code section with copy/link/share | Frontend | 0.10 | 3h |
| 1B.4 | Connect to Supabase API: `/api/dashboard/summary` | Full-stack | 0.4 | 4h |
| **Purchase Node page** | | | | |
| 1B.5 | Hero pricing component (current tier, price, discount, remaining) | Frontend | 0.10 | 4h |
| 1B.6 | Tier visualization bar (sold/active/future segments) | Frontend | — | 6h |
| 1B.7 | Chain selector component | Frontend | 0.3 | 3h |
| 1B.8 | Quantity selector with per-wallet limit validation | Frontend | — | 3h |
| 1B.9 | Payment token selector with live balance read | Frontend | 0.3, 1A.7 | 4h |
| 1B.10 | Purchase summary (price × qty, gas estimate, total) | Frontend | 1B.9 | 3h |
| 1B.11 | Approve + Purchase two-step flow with loading/error/success states | Frontend | 1A.7 | 12h |
| 1B.12 | Post-purchase success modal (confetti, node count, CTA) | Frontend | 1B.11 | 4h |
| 1B.13 | Error handling — all 12 error states from spec | Frontend | 1B.11 | 8h |
| 1B.14 | Pending transaction recovery (localStorage persistence) | Frontend | 1B.11 | 4h |
| **Node Status page** | | | | |
| 1B.15 | Emission hero number with own/referral breakdown | Frontend | 0.10 | 4h |
| 1B.16 | Node inventory list from on-chain data | Frontend | 1A.7 | 6h |
| 1B.17 | Connect to API: `/api/nodes/mine` | Full-stack | 0.4 | 4h |
| **Referrals page** | | | | |
| 1B.18 | Partner Status Card (tier badge, name, date, stats) | Frontend | 0.10 | 4h |
| 1B.19 | Commission by level display | Frontend | 0.10 | 3h |
| 1B.20 | Milestone proximity with progress bars | Frontend | 0.10 | 3h |
| 1B.21 | Activity feed (realtime via Supabase) | Frontend | 0.4 | 6h |
| 1B.22 | Network breakdown (L1-L5+ counts) | Frontend | — | 2h |
| 1B.23 | Payout history table | Frontend | — | 3h |
| 1B.24 | Programme Reference (rates, weights, stipend) collapsible | Frontend | 0.10 | 3h |
| 1B.25 | Connect to API: `/api/referrals/summary`, `/activity`, `/payouts` | Full-stack | 0.4 | 6h |
| **Resources page** | | | | |
| 1B.26 | Static content with download links, community, compliance | Frontend | — | 3h |

**Deliverable:** Full dashboard working on testnet. All pages functional. Purchase flow end-to-end on testnet.

---

### Phase 1C: Backend Services (Week 3-5)

**Objective:** Event indexing, referral attribution, commission calculation.

| # | Task | Owner | Deps | Est. |
|---|---|---|---|---|
| 1C.1 | Supabase database schema — all tables from spec (users, referrals, referral_purchases, commission_payouts, epp_partners) | Backend | 0.4 | 4h |
| 1C.2 | Row-level security policies — users see own data, EPP sees own programme data | Backend | 1C.1 | 3h |
| 1C.3 | API: POST `/api/sale/validate-code` — code lookup, discount response | Backend | 1C.1 | 3h |
| 1C.4 | Event indexer: listen for NodePurchased events on Arbitrum (Alchemy webhook) | Backend | 1A.6 | 6h |
| 1C.5 | Event indexer: listen for NodePurchased events on BSC (QuickNode webhook) | Backend | 1A.6 | 4h |
| 1C.6 | Purchase recorder: on event → write purchase record, update node cache | Backend | 1C.4 | 4h |
| 1C.7 | Referral attribution service: on purchase → walk referral chain, calculate commission per level, update credited amounts | Backend | 1C.6 | 12h |
| 1C.8 | Tier auto-promotion: on credited_amount crossing threshold → update partner tier | Backend | 1C.7 | 3h |
| 1C.9 | Milestone detection: on credited_amount crossing milestone → flag for bonus | Backend | 1C.7 | 3h |
| 1C.10 | Cache layer: Redis cache for sale status, tier remaining (10s TTL) | Backend | — | 3h |
| 1C.11 | Admin notifications: Telegram webhook on tier sellout, new EPP partner, milestone hit | Backend | 1C.9 | 3h |
| 1C.12 | API: GET `/api/dashboard/summary` (aggregated home page data) | Backend | 1C.1 | 4h |
| 1C.13 | API: GET `/api/nodes/mine` (on-chain NFT read + cached metadata) | Backend | 1C.6 | 4h |
| 1C.14 | API: GET `/api/referrals/summary`, `/activity`, `/payouts` | Backend | 1C.7 | 6h |
| 1C.15 | Community referral codes — auto-generate for every node buyer | Backend | 1C.6 | 6h |
| 1C.16 | Basic Referrals view for non-EPP users (code, count, earnings) | Frontend | 1C.15 | 6h |

**Deliverable:** Backend processes purchase events in real-time. Referral attribution and commission calculation working. Community referral codes generated for every buyer from day one. All APIs serving real data.

---

### Phase 1D: Hardening & Launch Prep (Week 5-6)

| # | Task | Owner | Deps | Est. |
|---|---|---|---|---|
| 1D.1 | Rate limiting on all API endpoints | Backend | 1C | 3h |
| 1D.2 | Input validation + sanitization on all endpoints | Backend | 1C | 3h |
| 1D.3 | CSP headers, CORS whitelist | DevOps | — | 2h |
| 1D.4 | Error boundary components at page level | Frontend | 1B | 3h |
| 1D.5 | Loading/skeleton states for all data-dependent components | Frontend | 1B | 4h |
| 1D.6 | Offline/disconnected state handling | Frontend | 1B | 3h |
| 1D.7 | Mobile testing: iOS Safari, Android Chrome, MetaMask mobile, Trust Wallet, Telegram in-app browser | QA | 1B | 8h |
| 1D.8 | Cross-browser testing: Chrome, Firefox, Safari, Brave | QA | 1B | 4h |
| 1D.9 | E2E test suite: full purchase flow, wallet connect, language switch, referral code validation | QA | 1B | 8h |
| 1D.10 | Load test: simulate 1,000 concurrent users on sale page | QA | 1C | 4h |
| 1D.11 | Smart contract security audit review — address findings | Contract | ext | 8-16h |
| 1D.12 | Mainnet contract deployment (both chains) with multi-sig | Contract | 1D.11 | 4h |
| 1D.13 | DNS setup: app.operon.network → Vercel | DevOps | — | 1h |
| 1D.14 | Final i18n review — native speaker check for TC/SC | Content | 1B.26 | 4h |
| 1D.15 | EPP partner onboarding page integration — code generation, account creation API | Backend | 1C.1 | 6h |
| 1D.16 | Populate initial EPP invite codes in production database | Admin | 1D.15 | 1h |
| 1D.17 | Monitoring setup: uptime, contract balance alerts, error rate dashboards | DevOps | 1D.6 | 4h |

**Deliverable:** Production-ready dashboard. Contracts on mainnet. Monitoring active. Ready for first EPP partner invite.

---

### Phase 2: Public Sale (Week 7-10)

| # | Task | Owner | Est. |
|---|---|---|---|
| 2.1 | Expand tier visualization to all 40 tiers (scrollable/dropdown) | Frontend | 4h |
| 2.2 | Per-wallet tier limits in smart contract (Tier 1-3: limited) | Contract | 4h |
| 2.3 | Real-time tier transitions (WebSocket or Supabase Realtime) | Full-stack | 8h |
| 2.4 | Backup RPC failover (Alchemy → QuickNode → public) | Backend | 4h |
| 2.5 | Database read replicas for peak load | DevOps | 4h |
| 2.6 | Korean + Vietnamese translations | Content | 6h |
| 2.7 | Load test: 10,000 concurrent users | QA | 4h |

---

### Phase 3: Post-Sale (Week 11-16)

| # | Task | Owner | Est. |
|---|---|---|---|
| 3.1 | Sale page → "Sold Out" state with secondary market links | Frontend | 3h |
| 3.2 | KYC integration (Sumsub or Synaps) | Full-stack | 16h |
| 3.3 | Commission payout batch transfer script | Contract | 12h |
| 3.4 | Biweekly commission calculation job | Backend | 8h |
| 3.5 | Payout tracking interface (partners see incoming transfers) | Frontend | 8h |
| 3.6 | Node delegation contract | Contract | 12h |
| 3.7 | Delegation UI (select nodes → choose operator) | Frontend | 8h |
| 3.8 | NaaS provider directory | Full-stack | 6h |
| 3.9 | Multi-wallet linking | Full-stack | 8h |
| 3.10 | Burn mechanism for unsold nodes (governance decides, not automatic) | Contract | 6h |
| 3.11 | Enhanced emission estimates (post-burn, final numbers) | Frontend | 4h |

---

### Phase 4: Post-TGE (Week 17-24)

| # | Task | Owner | Est. |
|---|---|---|---|
| 4.1 | Rewards contract (emission distribution, claiming, vesting) | Contract | 20h |
| 4.2 | Rewards tab — earned, claimable, claimed, vesting schedule | Frontend | 12h |
| 4.3 | Claim interface (standard 120-day vest vs early exit 50%) | Frontend | 8h |
| 4.4 | Live emission tracking (daily/weekly/monthly) | Full-stack | 8h |
| 4.5 | Staking contract | Contract | 16h |
| 4.6 | Staking UI — lock duration, APY, stake/unstake | Frontend | 10h |
| 4.7 | Node operations — uptime monitoring, performance metrics | Full-stack | 12h |
| 4.8 | $OPRN price feed (DEX TWAP) | Backend | 4h |
| 4.9 | Portfolio valuation display | Frontend | 4h |
| 4.10 | Commission switch to $OPRN | Backend | 6h |

---

### Phase 5: Ecosystem (Week 25+)

| # | Task | Owner | Est. |
|---|---|---|---|
| 5.1 | Ecosystem partner rewards (EcoDrop equivalent) | Full-stack | 16h |
| 5.2 | Governance voting interface | Full-stack | 16h |
| 5.3 | Secondary market integration (OpenSea SDK) | Frontend | 8h |
| 5.4 | Advanced analytics (emission charts, portfolio history) | Frontend | 12h |
| 5.5 | Mobile app (React Native wrapper) | Mobile | 40h |
| 5.6 | In-app bridge (Li.Fi / Socket) | Frontend | 12h |
| 5.7 | Partner API (REST for large partners) | Backend | 16h |
| 5.8 | Social login (Dynamic or Privy) for non-crypto referral chain | Full-stack | 12h |

---

## Total Estimated Hours (Phase 1 Only)

| Area | Hours |
|---|---|
| Phase 0: Foundation | ~40h |
| Phase 1A: Smart Contracts | ~60h |
| Phase 1B: Frontend | ~110h |
| Phase 1C: Backend | ~60h |
| Phase 1D: Hardening | ~70h |
| **Phase 1 Total** | **~340h** |

At 2 full-stack developers: ~8-10 weeks to production.
At 3 developers (1 contract, 2 full-stack): ~6 weeks to production.

External dependencies:
- Smart contract security audit: 2-4 weeks, $15K-$50K (schedule at start of Phase 1A)
- Domain DNS: 24-48h propagation
- WalletConnect Project ID: immediate (free)
- Alchemy API key: immediate (free tier sufficient for Phase 1)
- Supabase project: immediate (free tier sufficient for Phase 1)
