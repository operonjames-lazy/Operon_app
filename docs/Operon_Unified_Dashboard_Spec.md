# Operon Unified Dashboard — Product Spec

*Version 1.0*
*One app for everyone: buyers, referrers, and Elite Partners*

---

## 1. Core Architecture

### One app. One URL. Every user type.

The Operon dashboard is a single web application at `app.operon.network`. Every user — node buyer, community referrer, Elite Partner — logs into the same app. What they see depends on their role, what they own, and what stage the project is at.

There is no separate "sale page" and "dashboard." The sale lives inside the dashboard. When a buyer clicks a referral link (`operon.network/node?ref=OPRN-K7VM`), they're redirected to `app.operon.network` with the referral code captured. They connect a wallet, land on the Sale tab, and buy. After purchase, they're already inside their dashboard — node inventory, estimated rewards, and their own referral code are one tab away.

### URL routing

```
app.operon.network                     → Login / connect wallet
app.operon.network?ref=OPRN-K7VM       → Referral code captured, Sale tab default
app.operon.network/sale                 → Sale page (buy nodes)
app.operon.network/nodes               → Node inventory
app.operon.network/rewards              → Reward tracking / claiming
app.operon.network/referrals            → Referral dashboard
app.operon.network/programme            → EPP programme details (EPP only)
app.operon.network/resources            → Downloads, community, compliance
app.operon.network/settings             → Account settings
```

### Authentication

Three login paths, one unified account:

1. **Wallet connect** (MetaMask, Rabby, WalletConnect, Coinbase Wallet) — primary
2. **Email + password** — creates account, wallet linked later at purchase
3. **Google OAuth** — creates account, wallet linked later at purchase

Wallet required at purchase time, not at login. This matters because the referral cascade reaches non-crypto people by L4/L5 — they need to be able to create an account and explore before committing a wallet.

### Role detection

Roles are additive, not exclusive. A single user can be all three:

| Role | How acquired | What unlocks |
|---|---|---|
| **Visitor** | Connects wallet or creates account | Sale tab, public info |
| **Node buyer** | Purchases ≥1 node | Nodes tab, Rewards tab, auto-generated referral code |
| **Community referrer** | Any node buyer (automatic) | Referrals tab (basic view: code, count, earnings) |
| **Elite Partner** | Invited + onboarded via EPP page | Referrals tab (full view), Programme tab, Resources tab, referral selling with 15% discount |

The dashboard checks:
- Does this wallet hold Operon Node NFTs? → Show Nodes tab with inventory
- Is this wallet/email registered as an EPP partner? → Show Programme tab, full Referrals view
- Has this user generated any referrals? → Show Referrals tab
- Has this wallet claimed any rewards? → Show claim history in Rewards tab

---

## 2. Navigation Structure

### Sidebar (desktop) / Bottom tabs (mobile)

```
┌─────────────────────┐
│ OPERON              │
├─────────────────────┤
│ ◎  Overview         │  ← Everyone
│ ⬡  Sale             │  ← Everyone (purchase interface)
│ ◈  Nodes            │  ← Node holders (empty state for non-holders)
│ ↻  Rewards          │  ← Node holders (empty state pre-TGE)
│ ↗  Referrals        │  ← Anyone with a referral code
├─────────────────────┤  ← EPP SECTION (EPP users only)
│ ★  Programme        │  ← Tier table, milestones, stipends
│ 📄 Resources        │  ← Pitch manual, brand assets, compliance
├─────────────────────┤  ← COMING SOON (greyed)
│ ◇  Staking          │
│ ⚙  Node Ops         │  ← Delegation, NaaS
├─────────────────────┤
│ ⚡ Settings          │
├─────────────────────┤
│ David Kim           │
│ Elite Partner       │
│ Affiliate tier      │
└─────────────────────┘
```

Mobile: 5 bottom tabs (Overview, Sale, Nodes, Rewards, Referrals) + hamburger for Programme, Resources, Settings.

### Announcement banner

Persistent top banner across all pages. Dismissible but reappears for new announcements. Used for:
- "Genesis Node Sale is live"
- "Tier 2 is 80% sold"
- "Biweekly payout processed — check Referrals"
- "KYC now required for reward claiming"
- "Node delegation is now available"

---

## 3. Page Specifications

### 3.1 Overview

The at-a-glance page. Shows different content based on role and stage.

**For a new visitor (no nodes, no referrals):**
- Welcome message
- "Get started" card linking to Sale tab
- Current sale status (current tier, remaining in tier, total remaining)
- If referral code in URL: "You're getting 15% off with code OPRN-K7VM" confirmation banner

**For a node holder:**
- Stat cards: Nodes owned, Total invested, Estimated daily reward, Total referral earnings
- Sale status (current tier, next price increase)
- Quick referral code bar with copy/share
- Recent activity (purchases, referral events)

**For an Elite Partner:**
- Everything above plus:
- Tier progress bar (credited amount → next tier)
- Network size (total referrals across all levels)
- Commission breakdown summary

### 3.2 Sale

**The purchase interface. This is where revenue happens.**

**Layout:**

```
┌──────────────────────────────────────┐
│ Referral code: OPRN-K7VM  ✓ Applied  │  ← Shows discount, or input field
├──────────────────────────────────────┤
│                                      │
│  TIER STATUS                         │
│  ┌────┬────┬────┬────┬────┐         │
│  │ T1 │ T2 │ T3 │ T4 │ T5 │  ...   │  ← Visual tier bar, sold-out greyed
│  └────┴────┴────┴────┴────┘         │
│                                      │
│  Current tier: Tier 2                │
│  Price: $525                         │
│  Your price: $446 (15% off)          │
│  Remaining: 847 nodes                │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ Quantity:  [ - ]  1  [ + ]   │    │
│  │ Total:     $446              │    │
│  │ Chain:     ○ BNB  ● Arbitrum │    │
│  │ Pay with:  USDC ▼            │    │
│  │ Balance:   $2,340 USDC       │    │
│  │                              │    │
│  │ [ Approve USDC ]             │    │  ← Step 1: token approval
│  │ [ Purchase Node ]            │    │  ← Step 2: buy (greyed until approved)
│  └──────────────────────────────┘    │
│                                      │
│  Your wallet: 0x742d...2bD38         │
│  Not your wallet? Switch ↗           │
│                                      │
└──────────────────────────────────────┘
```

**Purchase flow (7 steps, 2 transactions):**

1. **Referral code** — auto-filled from URL param, or user types one in. Validated against backend. Shows discount amount if valid (EPP = 15%, Community = 10%). Shows "Invalid code" if not. Field is optional — no code means full price purchase.

2. **Tier display** — visual bar showing all tiers. Current active tier highlighted. Sold-out tiers greyed. Remaining count shown. Shows: current tier, remaining in tier, total remaining.

3. **Chain selection** — BNB Chain or Arbitrum. Shows available payment tokens for selected chain. Shows wallet balance for each token.

4. **Payment token** — dropdown. BSC: BNB, USDT (BEP-20), USDC (BEP-20). Arbitrum: ETH, USDC, USDT. Shows live balance. If insufficient balance: "Insufficient [TOKEN] balance" with bridge link.

5. **Quantity** — increment/decrement, or type directly. Per-wallet limits if enforced (e.g., Tier 1 max 5 per wallet for fair distribution). Shows total cost. Shows "You'll receive X Node NFTs."

6. **Approve** — first transaction. ERC-20 approval for the sale contract to spend the buyer's tokens. Shows estimated gas. Wallet prompt. Confirmation. Button changes to "Approved ✓" after success. (Not needed if paying with native token — ETH or BNB.)

7. **Purchase** — second transaction. Calls the sale contract. Shows estimated gas. Wallet prompt. Loading state. On success: confetti, "Congratulations" modal showing purchased nodes, link to Nodes tab. On failure: error message with retry.

**Post-purchase modal:**
```
✓ Purchase Complete

You now own 3 Operon Nodes (Tier 2)

Your referral code: OPRN-K7VM
Share it — your buyers get 10% off, you earn commission.

[ View My Nodes ]  [ Share Code ]  [ Buy More ]
```

**Edge cases the Sale page handles:**
- Tier sells out during browsing → auto-advance to next tier, show notification
- Sale paused → "Sale is temporarily paused. Check back shortly."
- Sale completed (all sold out or closed) → "Sold out" state with secondary market links (OpenSea, etc.)
- Wallet not connected → "Connect wallet to purchase" with wallet selector
- Wrong chain → "Switch to [Arbitrum/BNB Chain] to continue" with chain-switch prompt
- Insufficient balance → "You need X more USDC" with bridge/swap link
- Transaction fails → "Transaction failed: [reason]. Your funds are safe. Try again."

**Per-wallet limits (optional, recommended for Tiers 1-3):**

| Tier | Max per wallet |
|---|---|
| 1 | 5 |
| 2 | 10 |
| 3 | 20 |
| 4+ | No limit |

This prevents whales from sweeping cheap tiers. Enforced at the smart contract level.

### 3.3 Nodes

**Your node inventory. This is the "I own something" page.**

**Pre-purchase (empty state):**
- "You don't own any nodes yet."
- CTA: "Go to Sale →"
- Info card: "What is an Operon Node?" with brief explanation

**Post-purchase:**
- Summary cards: Total nodes, Tiers held, Total invested, Estimated annual reward
- Node list (sortable by tier, date, chain):

```
┌─────────────────────────────────────────────────┐
│ Node #1247                                       │
│ Tier 2 · $525 ($446 paid) · Arbitrum             │
│ Purchased: 2026-04-15 · Tx: 0x3f8a...           │
│ Status: Active · Delegation: None                │
│ Est. daily reward: ~63 $OPRN                     │
│                                         [Manage] │
└─────────────────────────────────────────────────┘
```

- Each node shows: NFT ID, tier, price paid (with discount noted), chain, purchase date, tx hash (linked to explorer), status, delegation status, estimated daily reward.

**Post-TGE additions:**
- Delegation button (assign to self-run or NaaS provider)
- Uptime indicator
- Actual vs estimated reward comparison
- "Run Node" guide link
- NaaS provider directory

**NFT display:**
- Option to view node NFT metadata / image
- Link to view on OpenSea / other marketplace (after transfer lock expires)

### 3.4 Rewards

**Everything you've earned and can claim.**

**Pre-TGE (empty state with projections):**
- "Rewards begin at TGE" banner with countdown or "Date TBA"
- Estimated rewards calculator:
  - Input: number of nodes, tiers
  - Output: estimated daily/monthly/annual $OPRN based on emission schedule
  - Disclaimer: "Estimates are illustrative. Actual rewards depend on network performance and token market conditions."
- Breakdown: base emission, performance bonus potential, referral pool
- "Learn how rewards work" expandable with emission schedule details

**Post-TGE:**
- Summary cards: Total earned, Claimable now, Claimed to date, Vesting
- Claim button (triggers on-chain claim transaction)
- Vesting schedule visualization (how much unlocks when)
- Reward history table:

```
Date        | Source          | Amount      | Status    | Tx
2026-08-01  | Base emission   | 63.2 $OPRN  | Claimed   | 0x7a2...
2026-08-01  | Performance     | 12.1 $OPRN  | Claimed   | 0x7a2...
2026-08-01  | Referral pool   | 8.4 $OPRN   | Vesting   | —
```

- Staking shortcut: "Stake your $OPRN" link to Staking page (when available)

**KYC gate (if implemented):**
- Rewards accrue regardless of KYC status
- Claiming requires KYC completion
- KYC banner: "Complete KYC to claim your rewards" with link to verification flow
- KYC status: Not started / Pending / Verified / Rejected

### 3.5 Referrals

**Two views: basic (community referrer) and full (Elite Partner).**

**Basic view (any node buyer):**
- Referral code bar with copy/share/QR
- "Your buyers get 10% off. You earn 5% commission." (community rates)
- Stats: Total referrals, Nodes sold via your code, Total commission
- Simple list of referral events (anonymized: "Referral purchased 2 nodes at Tier 3")
- Payout history (when applicable)
- "Upgrade to Elite Partner" info (if EPP is still accepting partners)

**Full EPP view (everything above plus):**
- "Your buyers get 15% off" (EPP rates)
- Stats expanded: Credited amount, Commission, Network size, Current tier
- Tier progress bar: "Affiliate → Partner: $2,340 / $5,000"
- Network breakdown (L1 through L5+ counts)
- Commission by level (L1: $X at 12%, L2: $Y, L3: $Z, Total: $W)
- Activity feed (recent events with timestamps)
- Shareable content:
  - QR code for referral link
  - Pre-written share messages (copy-paste for Telegram/WhatsApp):
    - "Get 15% off Operon Nodes with my code: [CODE]. [LINK]"
    - Localized versions (EN, TC, SC, KO, VI)
- Payout history with tx hashes and dates

**Commission display:**

```
Commission Summary

Unpaid:     $1,240.00
Next payout: April 15, 2026 (biweekly batch transfer)

Level   | Sales  | Commission
L1      | $4,250 | $510.00 (12%)
L2      | $2,800 | $196.00 (7%)
L3      | $1,200 | $54.00 (4.5%)
L4      | $500   | $15.00 (3%)
────────────────────────────
Total   |        | $775.00

Payout History
Date        | Amount   | Token | Tx
2026-04-01  | $465.00  | USDC  | 0x8b3...
```

### 3.6 Programme (EPP only)

**The confidential programme reference. Only visible to registered EPP partners.**

Collapsible cards (same as current dashboard build):
- Commission rates & tiers (full 6-tier table)
- Milestone bonuses (7 thresholds)
- Credited amount weights (L1-L8)
- Stipend activation gate (with examples)

Milestone progress indicators — each milestone shows progress bar:
```
$10,000 → $500 bonus    ████████░░ 83% ($8,340 / $10,000)
$25,000 → $1,500 bonus  ███░░░░░░░ 33% ($8,340 / $25,000)
```

Stipend tracker (when applicable):
```
Current tier: Partner ($1,500/mo stipend)
Biweekly gate: $3,750 in L1 sales
This period: $2,800 / $3,750 (74.7% — half stipend zone)
```

### 3.7 Resources

**Downloads, links, and compliance. Available to EPP partners, partially available to all.**

**For everyone:**
- Social links: Telegram, Discord, X, Website
- FAQ / Help center link
- Support contact
- Chain guides: "How to bridge to Arbitrum" / "How to get USDC on BNB Chain"

**For EPP partners (additional):**
- Pitch Training Manual (PDF download)
- Brand Assets (download link)
- Terms & Conditions (v1.0)
- Share templates (pre-written messages in 5 languages)
- Compliance reminders (the four rules)

### 3.8 Settings

- Connected wallets (primary + additional, multi-wallet support)
- Payout chain preference (BSC / Arbitrum)
- Email address (for notifications)
- Language selector (EN, 繁中, 简中, 한국어, Tiếng Việt)
- Notification preferences (email, in-app)
- KYC status and verification link (when applicable)
- Sign out

---

## 4. Stage-by-Stage Feature Availability

| Feature | Active Sale | Paused | Closed (Pre-TGE) | Post-TGE |
|---|---|---|---|---|
| Overview | ✓ | ✓ | ✓ | ✓ |
| Sale (buy nodes) | ✓ (everyone) | ✗ (paused notice) | ✗ (sold out) | ✗ (secondary market link) |
| Nodes (inventory) | ✓ | ✓ | ✓ | ✓ |
| Rewards (estimates) | ✓ (projections) | ✓ (projections) | ✓ (projections) | ✓ (live claiming) |
| Referrals (basic) | ✓ (from first purchase) | ✓ | ✓ | ✓ |
| Referrals (EPP full) | ✓ | ✓ | ✓ | ✓ |
| Programme (EPP) | ✓ | ✓ | ✓ | ✓ |
| Resources | ✓ | ✓ | ✓ | ✓ |
| Delegation | ✗ | ✗ | ✓ | ✓ |
| Staking | ✗ | ✗ | ✗ | ✓ |
| KYC | Optional | Optional | Recommended | Required for claims |
| Node Ops (uptime) | ✗ | ✗ | ✗ | ✓ |

---

## 5. Smart Contract Interaction Points

The dashboard makes on-chain calls at these moments:

| Action | Contract | Chain | Tx count |
|---|---|---|---|
| Purchase node (ERC-20) | Sale contract | BSC or Arbitrum | 2 (approve + buy) |
| Purchase node (native) | Sale contract | BSC or Arbitrum | 1 (buy) |
| Claim $OPRN rewards | Rewards contract | Arbitrum | 1 |
| Delegate node to operator | NFT contract | BSC or Arbitrum | 1 |
| Stake $OPRN | Staking contract | Arbitrum | 2 (approve + stake) |

All other data (referral tracking, commission calculation, tier progress, activity feed) is off-chain, served by the backend API.

---

## 6. Backend API Endpoints Required

### Auth & Account
```
POST /api/auth/wallet        — Connect wallet, create/find account
POST /api/auth/email         — Email + password login
POST /api/auth/google        — Google OAuth
POST /api/auth/link-wallet   — Link additional wallet to account
GET  /api/account/me         — Current user profile, role, settings
PUT  /api/account/settings   — Update preferences
```

### Sale
```
GET  /api/sale/status         — Current tier, remaining, prices, sale stage (active/paused/closed)
GET  /api/sale/tiers          — All tier data with remaining counts
POST /api/sale/validate-code  — Validate referral code, return discount info
POST /api/sale/record         — Record purchase after on-chain confirmation (webhook or polling)
```

### Nodes
```
GET  /api/nodes/mine          — User's node inventory (reads NFT ownership on-chain + local metadata)
GET  /api/nodes/:id           — Single node detail
POST /api/nodes/:id/delegate  — Initiate delegation (prepares on-chain tx)
```

### Rewards
```
GET  /api/rewards/summary     — Total earned, claimable, claimed, vesting
GET  /api/rewards/estimate    — Projected rewards based on owned nodes
GET  /api/rewards/history     — Claim history with tx hashes
POST /api/rewards/claim       — Initiate claim (prepares on-chain tx)
```

### Referrals
```
GET  /api/referrals/summary   — Code, stats, network size, commission
GET  /api/referrals/network   — Breakdown by level (L1-L8 counts)
GET  /api/referrals/activity  — Recent events feed
GET  /api/referrals/commission — Commission by level
GET  /api/referrals/payouts   — Payout history with tx hashes
```

### EPP-specific
```
GET  /api/epp/programme       — Tier table, milestones, weights (EPP auth required)
GET  /api/epp/progress        — Credited amount, tier progress, stipend status
GET  /api/epp/milestones      — Milestone progress with completion %
```

### Announcements
```
GET  /api/announcements       — Active announcements for banner
POST /api/announcements/dismiss — Mark announcement as read
```

---

## 7. Data Architecture

### On-chain (source of truth for ownership and tokens)
- Node NFTs (ERC-721 on BSC and Arbitrum)
- $OPRN token balances
- Sale contract (tier pricing, remaining counts, purchase logic)
- Rewards contract (emission distribution, claiming)
- Referral mapping (code → wallet, stored on-chain or hybrid)

### Off-chain (backend database — Supabase/Postgres)
- User accounts (email, wallets, settings, role, KYC status)
- EPP partner records (from onboarding flow)
- Referral code registry (code → user mapping, type: community or EPP)
- Referral cascade (who referred whom, all levels)
- Commission calculations (aggregated from on-chain events)
- Commission payouts (amounts, dates, tx hashes)
- Activity feed events
- Announcement records
- Session management

### Hybrid approach
- Node ownership verified on-chain (read NFT balances) but cached off-chain for fast display
- Tier remaining counts read from contract but cached with 10-second refresh
- Commission calculated off-chain from on-chain purchase events (event listener / indexer)
- Referral attribution stored off-chain, commission amounts derived from on-chain purchase data

---

## 8. Multi-Chain Handling

The buyer picks their chain at purchase time. The dashboard needs to handle:

**Wallet chain detection:**
- On connect, detect current chain
- If wrong chain for intended action, prompt switch: "Switch to Arbitrum to continue"
- Show balances for the connected chain

**Multi-chain node display:**
- User may own nodes on both BSC and Arbitrum
- Nodes tab shows all nodes regardless of chain, with chain badge on each
- Rewards tab shows combined rewards (if emissions are per-chain, show breakdown)

**Chain-specific payment tokens:**

| Chain | Native | Stablecoins |
|---|---|---|
| BNB Chain | BNB | USDT (BEP-20), USDC (BEP-20) |
| Arbitrum | ETH | USDC, USDT |

**Bridge guidance:**
- If user has funds on wrong chain, show "Bridge to [chain]" link
- Link to official bridges: bridge.arbitrum.io, cbridge for BSC
- Future: in-app bridge integration via aggregator (Li.Fi, Socket)

---

## 9. Mobile UX

**Bottom tab bar (5 tabs):**
```
[ Overview ] [ Sale ] [ Nodes ] [ Rewards ] [ More ]
```

"More" opens a sheet with: Referrals, Programme, Resources, Settings.

**Key mobile considerations:**
- Wallet connect via WalletConnect or in-app browser (MetaMask mobile, Trust Wallet)
- Share button uses native share sheet (works in Telegram in-app browser)
- QR code for referral link (partner shows phone, buyer scans)
- Tier display scrolls horizontally on small screens
- Purchase flow is single-column, vertically stacked
- Toast notifications for copy/transaction events

**Telegram in-app browser handling:**
- Detect in-app browser
- Show "Open in Chrome/Safari" prompt for wallet actions (in-app browsers can't reliably connect wallets)
- Referral code captured before browser switch (stored in cookie or URL param persists)

---

## 10. Security & Access Control

**Route protection:**
- Sale: public (anyone can view, wallet required to purchase)
- Nodes: requires connected wallet (reads on-chain)
- Rewards: requires connected wallet
- Referrals: requires account (wallet or email)
- Programme: requires EPP role verification
- Resources: partially public, EPP-only sections gated
- Settings: requires authenticated session

**Rate limiting:**
- Sale status: 60 req/min (high traffic during sale)
- Code validation: 10 req/min/IP (prevent brute force)
- Purchase recording: 5 req/min/wallet
- All other endpoints: 30 req/min

**Session management:**
- JWT with 24-hour expiry
- Refresh token with 7-day expiry
- Wallet signature for initial auth (Sign-In with Ethereum / BNB)

---

## 11. Empty States

Every section needs a meaningful empty state that guides the user to the next action.

| Section | Empty State | CTA |
|---|---|---|
| Overview (new user) | "Welcome to Operon. The Genesis Node Sale is live." | "Buy your first node →" |
| Nodes | "You don't own any nodes yet." | "Go to Sale →" |
| Rewards (pre-TGE) | "Rewards begin at TGE. Here's what you can expect." | Show estimator |
| Rewards (post-TGE, no nodes) | "Purchase a node to start earning rewards." | "Go to Sale →" |
| Referrals (no activity) | "Share your code to start earning." | Copy code button |
| Activity feed | "No activity yet. Share your code to get started." | — |
| Payout history | "No payouts yet. Commissions are paid biweekly." | — |
| Delegation | "Delegation will be available when the network launches." | — |
| Staking | "Staking will be available after TGE." | — |

---

## 12. Build Priority

### Phase 1 — Sale launch (build first)
- [ ] Auth (wallet connect + email/password)
- [ ] Sale page with tier display, referral code (optional), chain selector, purchase flow
- [ ] Overview page (EPP partner view with stats)
- [ ] Referrals page (EPP full view with network count, activity, commission)
- [ ] Community referral codes (auto-generated for every buyer from day one)
- [ ] Referrals basic view (for non-EPP users)
- [ ] Programme page (tier table, milestones, weights, stipend)
- [ ] Resources page (downloads, social, compliance)
- [ ] Settings (basic: wallets, language, payout chain)
- [ ] Announcement banner
- [ ] Mobile responsive + bottom tabs
- [ ] Smart contract: sale contract on BSC + Arbitrum (referral code, discount logic)

### Phase 2 — Scaling (add for higher traffic)
- [ ] Per-wallet tier limits
- [ ] Sale page: all 40 tiers
- [ ] Nodes tab with NFT inventory
- [ ] Multiple payment token support
- [ ] Bridge guidance links

### Phase 3 — Post-sale, pre-TGE
- [ ] Rewards estimator
- [ ] KYC flow integration
- [ ] Delegation interface + NaaS directory
- [ ] Multi-wallet linking
- [ ] Payout history for EPP commissions

### Phase 4 — Post-TGE
- [ ] Live reward tracking
- [ ] Claim interface
- [ ] Staking page
- [ ] Node operations (uptime monitoring)
- [ ] $OPRN commission payouts (replacing USDC)
- [ ] Ecosystem partner rewards (EcoDrop equivalent)
- [ ] Secondary market links (OpenSea, etc.)

---

## 13. Tech Stack (Recommended)

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14+ (App Router) | SSR for SEO, API routes for backend, React for UI |
| Styling | Tailwind CSS | Consistent with Operon design system, fast iteration |
| Wallet | Dynamic or RainbowKit + wagmi | Multi-chain, multi-wallet, social login |
| State | Zustand or Jotai | Lightweight, no boilerplate |
| Backend | Supabase (Postgres + Edge Functions) | Auth, database, real-time subscriptions |
| Chain data | viem + wagmi | Contract reads, event listening |
| Indexer | Alchemy / QuickNode webhooks or custom | Listen for purchase events, update backend |
| Email (if needed later) | Resend | Transactional emails |
| Hosting | Vercel | Edge deployment, same platform as Next.js |
| Analytics | PostHog or Mixpanel | Event tracking, funnel analysis |

---

## 14. Key Design Decisions to Make

1. **Per-wallet purchase limits at low tiers?** Recommended for fairness but adds smart contract complexity. Decision needed before contract deployment.

2. **Fiat onramp?** MoonPay or Alchemy Pay integration for buyers without crypto. Adds significant implementation time. Can be Phase 2.

3. **KYC timing?** At purchase (more friction, fewer buyers) vs at claim (less friction, more buyers, Aethir's approach). Recommend at claim.

4. **NFT transferability lock?** 12-month lock like Aethir/Sophon? Prevents immediate flipping but limits secondary market. Requires smart contract enforcement. Decision needed before contract deployment.

5. **Community referral rates?** Currently specced at 10% buyer discount / 5% referrer commission. Confirm before public sale code is written.

6. **Secondary market?** After transfer lock, allow trading on OpenSea etc.? If yes, NFT metadata and artwork need to be ready. If buyback program (like Sophon's), needs separate spec.

7. **In-app bridge?** Using Li.Fi or Socket for cross-chain swaps inside the dashboard vs linking to external bridges. Nice-to-have for Phase 2, not launch-critical.
