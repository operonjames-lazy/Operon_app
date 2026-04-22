# Operon Dashboard — Technical Scope of Work

*Based on current UI reference (v1.0)*
*5 phases from whitelist launch to mature platform*

---

## Phase 1: Whitelist Sale Launch

*Everything the current UI shows. The minimum viable product that earns revenue.*

### 1.1 Authentication & Account System

**What the UI requires:**
- Wallet connect button (MetaMask, WalletConnect, Coinbase Wallet, Rabby)
- Sign out button in header
- User name displayed in sidebar
- EPP tier badge in sidebar footer

**Backend work:**

| Component | Detail |
|---|---|
| Auth service | Sign-In with Ethereum (EIP-4361) — wallet signs a nonce, backend verifies signature and issues JWT |
| Session management | JWT access token (15 min) + refresh token (7 days) in httpOnly cookie |
| Account creation | Auto-create account on first wallet connect. Store: wallet address, created_at, role flags |
| EPP lookup | On login, check if wallet exists in `epp_partners` table. If yes, set `is_epp=true`, load tier data |
| Multi-wallet prep | Schema supports multiple wallets per account from day one even though UI shows one wallet in Phase 1 |

**Database tables:**

```sql
users (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ,
  primary_wallet VARCHAR(42) NOT NULL UNIQUE,
  email VARCHAR(255),
  display_name VARCHAR(100),
  language VARCHAR(5) DEFAULT 'en',
  payout_chain VARCHAR(10) DEFAULT 'bsc',
  is_epp BOOLEAN DEFAULT FALSE,
  epp_partner_id UUID REFERENCES epp_partners(id)
)

user_wallets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  chain VARCHAR(10),
  added_at TIMESTAMPTZ,
  is_primary BOOLEAN DEFAULT FALSE
)

sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  refresh_token_hash VARCHAR(64),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
```

**Error handling:**
- Wallet not installed → show "Install MetaMask" link
- User rejects signature → "Signature required to log in. Try again."
- Network timeout → retry with exponential backoff (3 attempts)
- Session expired → silent refresh via refresh token, redirect to login only if refresh fails
- Multiple tabs → single session, other tabs detect logout via BroadcastChannel API

**Hardening:**
- Nonce must be single-use, expire after 5 minutes
- Rate limit login attempts: 10/min per IP
- CORS whitelist: only app.operon.network
- JWT secret rotation capability without invalidating all sessions

---

### 1.2 Home Page

**What the UI shows:**
- 3 stat tiles: Nodes Owned, Est. Daily Emission, Referral Network
- Genesis Node Sale card with tier progress bar and remaining count
- Referral code with copy/link/share buttons
- Payout wallet and chain display

**API endpoints:**

```
GET /api/dashboard/summary
Response: {
  nodes_owned: number,
  total_invested: number,
  est_daily_emission: number,
  referral_count: number,
  referral_code: string,
  payout_wallet: string,
  payout_chain: string,
  sale: {
    stage: 'whitelist' | 'public' | 'closed',
    current_tier: number,
    current_price: number,
    discount_price: number | null,
    tier_remaining: number,
    total_remaining: number,
    total_supply: number,
    public_sale_date: string | null
  }
}
```

**Data sources:**
- `nodes_owned` — on-chain query: count of Operon Node NFTs held by user's wallet(s). Cached with 30s TTL.
- `est_daily_emission` — calculated: (user_nodes × base_daily_rate) + referral_pool_share. Base rate derived from emission schedule (Year 1: 40% of 63,000 / 365 = ~69.04/day in Y1).
- `referral_count` — off-chain: count from `referrals` table where `referrer_id = user.id`
- `sale.*` — on-chain read from sale contract, cached with 10s TTL

**Error handling:**
- Chain RPC down → serve last cached data with "Data may be delayed" indicator
- User has wallets on multiple chains → aggregate NFT count across all chains
- Zero nodes → show "Buy your first node" CTA, emission shows as 0
- Sale contract paused → show "Sale temporarily paused" instead of purchase CTA

---

### 1.3 Purchase Node (Sale Page)

**What the UI shows:**
- Hero pricing: current tier, discounted price (46px), original price struck through
- Tier visualization bar (5 segments for whitelist, 40 for public)
- Referral code confirmation with discount badge
- Chain selector (BNB Chain / Arbitrum)
- Quantity selector (1-10 per wallet)
- Payment token dropdown (USDC / USDT)
- Summary: price × qty, gas estimate, total
- Two-step purchase: Approve → Purchase
- Wallet address with switch option
- Remaining count per tier and total whitelist

**Smart contracts required:**

**Sale Contract (deploy on both BSC and Arbitrum):**

```
NodeSale.sol

State:
- tiers: mapping(uint => Tier) — price, supply, sold, active
- referralCodes: mapping(bytes32 => address) — code hash → partner wallet
- discountBps: mapping(bytes32 => uint16) — code hash → discount in basis points
- purchaseCount: mapping(address => mapping(uint => uint)) — wallet → tier → count
- maxPerWallet: mapping(uint => uint) — tier → max purchases per wallet
- acceptedTokens: address[] — USDC, USDT contract addresses
- paused: bool

Functions:
- purchase(uint tier, uint quantity, address token, bytes32 codeHash) payable
  - Validates: tier active, quantity available, wallet limit, token accepted, code valid
  - Calculates: price with discount if valid code
  - Transfers: tokens from buyer to treasury
  - Mints: quantity × NodeNFT to buyer
  - Emits: NodePurchased(buyer, tier, quantity, codeHash, totalPaid, token)

- validateCode(bytes32 codeHash) view returns (bool valid, uint16 discountBps)

Admin:
- setTierActive(uint tier, bool active) onlyOwner
- pause() / unpause() onlyOwner
- setMaxPerWallet(uint tier, uint max) onlyOwner
- addAcceptedToken(address token) onlyOwner
- withdrawFunds(address token, address to) onlyOwner
```

**Node NFT Contract (ERC-721, deploy on both chains):**

```
OperonNode.sol (ERC-721)

State:
- tokenTier: mapping(uint => uint) — tokenId → tier
- purchasePrice: mapping(uint => uint) — tokenId → price paid
- purchaseDate: mapping(uint => uint) — tokenId → timestamp
- transferLocked: bool — true for first 6 months

Functions:
- mint(address to, uint tier, uint price) onlyMinter
- tokenURI(uint tokenId) — returns metadata JSON
- transferFrom / safeTransferFrom — reverts if transferLocked and block.timestamp < lockExpiry

Metadata:
- name: "Operon Node #[id]"
- attributes: tier, price_paid, purchase_date, chain
- image: generated SVG or IPFS-hosted image per tier
```

**API endpoints:**

```
GET /api/sale/status
— Current tier, all tier data, remaining counts, sale stage, countdown target

POST /api/sale/validate-code
Body: { code: string }
— Returns: { valid: bool, discount_bps: number, partner_name: string | null }
— Rate limit: 10/min/IP

GET /api/sale/wallet-balance
Query: { wallet: string, chain: string }
— Returns: { usdc: string, usdt: string } (balances as decimal strings)
— Reads on-chain token balances

POST /api/sale/record-purchase
Body: { tx_hash: string, chain: string }
— Backend verifies tx on-chain, records in database
— Updates referral attribution, commission calculations
— Rate limit: 5/min/wallet
```

**Frontend purchase flow (detailed):**

1. User selects chain → frontend switches provider, checks wallet is on correct chain
2. User selects quantity → frontend calculates total, checks against wallet limit
3. User selects payment token → frontend reads token balance from chain
4. User clicks "Approve [TOKEN]":
   - Frontend calls `token.approve(saleContract, amount)` 
   - Shows loading spinner in button: "Approving..."
   - On success: button changes to "Approved ✓", purchase button enables
   - On reject: "Approval cancelled. Try again."
   - On error: "Approval failed: [reason]"
5. User clicks "Purchase [qty] Node":
   - Frontend calls `sale.purchase(tier, qty, token, codeHash)`
   - Shows loading spinner: "Confirming transaction..."
   - On success: confetti animation, modal: "You now own [qty] Operon Node(s)" with links to Node Status and Buy More
   - On reject: "Transaction cancelled."
   - On error: "Purchase failed: [reason]. Your funds are safe."
6. Backend event listener picks up `NodePurchased` event → records purchase, updates referral attribution

**Error handling matrix:**

| Error | User sees | Recovery |
|---|---|---|
| Wrong chain | "Switch to [BNB Chain/Arbitrum] to continue" + chain switch prompt | Auto-switch via `wallet_switchEthereumChain` |
| Insufficient balance | "You need $X more USDC. [Bridge funds →]" | Link to bridge (Arbitrum Bridge / cBridge) |
| Insufficient gas | "Not enough [BNB/ETH] for gas. You need ~$0.15." | Show minimum gas amount needed |
| Tier sold out during tx | "Tier 2 just sold out. You've been moved to Tier 3 at $468." | Auto-advance to next tier, re-confirm |
| Wallet limit reached | "You've reached the maximum of 10 nodes for this tier." | Disable quantity increase |
| Sale paused | "Sale is temporarily paused. Check back shortly." | Poll every 30s, auto-resume |
| Code invalid | "This referral code is not valid." | Clear code field, show input |
| Code not found in whitelist | "This code doesn't have whitelist access." | During whitelist only |
| Transaction reverted | "Transaction failed: [decoded reason]. No funds were charged." | Show retry button |
| RPC timeout | "Network is congested. Retrying..." | 3 retries with backoff, then "Try again later" |
| Approval already exists | Skip approve step, go straight to purchase | Check allowance on page load |

**Hardening:**
- Frontend polls tier remaining every 10 seconds during active sale
- Optimistic UI: show "Processing" state, confirm only after on-chain receipt
- Never show a "success" state until the transaction has ≥1 block confirmation
- Store pending transactions in localStorage to recover state on page refresh
- Double-purchase protection: disable purchase button for 30s after successful tx
- Gas estimation: call `estimateGas` before showing the purchase button; if it reverts, show the reason

---

### 1.4 Node Status Page

**What the UI shows:**
- Hero emission number: total daily emission (own nodes + referral pool)
- Breakdown: own nodes emission, referral pool emission
- Monthly/annual projections
- "Rewards begin at TGE" banner
- 3 stat tiles: Owned, Invested, Chains
- Node inventory cards (tier, ID, price paid, chain, date, status)

**API endpoints:**

```
GET /api/nodes/mine
Response: {
  nodes: [
    { 
      token_id: number, 
      tier: number, 
      price_paid: number,
      chain: string,
      purchased_at: string,
      tx_hash: string,
      status: 'active' | 'delegated' | 'locked',
      delegation: null | { provider: string, since: string }
    }
  ],
  summary: {
    total_owned: number,
    total_invested: number,
    chains: string[],
    est_daily_own: number,
    est_daily_referral_pool: number,
    est_daily_total: number
  }
}
```

**Emission calculation logic:**

```
Base emission per node (Year 1): 
  63,000 × 40% / 365 = 69.04 $OPRN/day

Year schedule:
  Y1: 40% → 69.04/day
  Y2: 30% → 51.78/day  
  Y3: 20% → 34.52/day
  Y4: 10% → 17.26/day

Referral pool share:
  Total referral pool = 8% of total emission
  User share = (nodes referred by user / total nodes sold) × daily pool emission
  Pre-TGE: estimated based on current referral count
```

**Data sources:**
- Node ownership: on-chain ERC-721 `balanceOf` + `tokenOfOwnerByIndex` on both chains
- Node metadata: on-chain `tokenTier`, `purchasePrice`, `purchaseDate` per token
- Cached in database, refreshed on purchase events and every 5 minutes
- Emission calculation: server-side, based on emission schedule and current network state

**Error handling:**
- Nodes on different chains → aggregate seamlessly, show chain badge per node
- NFT transferred away → remove from inventory on next refresh
- Node burned → show as "Burned" status (should not happen normally)
- Estimation disclaimer: always show "Estimates are illustrative" beneath projections

---

### 1.5 Referrals Page

**What the UI shows:**
- Partner Status Card (tier badge, name, join date, credited/commission/network)
- Referral code bar with copy/link/share
- Worked example: "At Tier 2 → you earn $53.52 per node"
- Tier progress bar: "$1,338 / $5,000"
- Commission by level (L1-L4 with rates and amounts)
- Milestone proximity with progress bars
- Activity feed (recent events)
- Network breakdown (L1-L5+ counts)
- Payout history
- Programme Reference (collapsible: rates, weights, stipend)

**API endpoints:**

```
GET /api/referrals/summary
Response: {
  partner: {
    name: string,
    tier: string,
    tier_index: number,
    joined_at: string,
    referral_code: string,
    credited_amount: number,
    total_commission: number,
    unpaid_commission: number,
    network_size: number,
    next_tier: { name: string, threshold: number } | null,
    next_milestone: { threshold: number, bonus: number, remaining: number } | null
  },
  commission_by_level: [
    { level: number, rate: number, sales_volume: number, commission: number }
  ],
  milestones: [
    { threshold: number, bonus: number, progress: number, achieved: boolean }
  ],
  network: [
    { level: number, count: number }
  ]
}

GET /api/referrals/activity?limit=20&offset=0
Response: {
  events: [
    { type: 'purchase' | 'signup', level: number, nodes: number, tier: number, amount: number, created_at: string }
  ]
}

GET /api/referrals/payouts
Response: {
  payouts: [
    { amount: number, token: string, chain: string, tx_hash: string, paid_at: string, period_start: string, period_end: string }
  ]
}
```

**Database tables:**

```sql
referrals (
  id UUID PRIMARY KEY,
  referrer_id UUID REFERENCES users(id),
  referred_id UUID REFERENCES users(id),
  level INTEGER NOT NULL, -- 1 = direct, 2 = second level, etc.
  code_used VARCHAR(20),
  created_at TIMESTAMPTZ,
  UNIQUE(referred_id) -- each user can only be referred once
)

referral_purchases (
  id UUID PRIMARY KEY,
  referral_id UUID REFERENCES referrals(id),
  purchase_tx VARCHAR(66),
  chain VARCHAR(10),
  tier INTEGER,
  quantity INTEGER,
  amount_usd DECIMAL(12,2),
  commission_usd DECIMAL(12,2),
  commission_rate DECIMAL(5,4),
  credited_amount DECIMAL(12,2), -- weighted contribution to referrer's credited total
  created_at TIMESTAMPTZ
)

commission_payouts (
  id UUID PRIMARY KEY,
  partner_id UUID REFERENCES users(id),
  amount DECIMAL(12,2),
  token VARCHAR(10),
  chain VARCHAR(10),
  tx_hash VARCHAR(66),
  merkle_root VARCHAR(66),
  period_start DATE,
  period_end DATE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, sent, confirmed
  created_at TIMESTAMPTZ
)
```

**Commission calculation service:**

```
On each NodePurchased event:
1. Look up buyer's referral chain (who referred them, who referred the referrer, etc.)
2. For each level in the chain (up to max cascade for referrer's tier):
   a. Calculate commission: purchase_amount × level_rate
   b. Calculate credited amount: purchase_amount × level_weight  
   c. Insert into referral_purchases
   d. Update epp_partners.credited_amount
   e. Check if credited_amount crossed a tier threshold → auto-promote
   f. Check if credited_amount crossed a milestone → flag for bonus payout
3. Queue commission for next biweekly payout cycle
```

**Cascade depth by tier:**

| Tier | Max cascade |
|---|---|
| Affiliate Partner | 4 levels |
| Partner | 5 levels |
| Senior Partner | 6 levels |
| Regional Director | 7 levels |
| Market Director | 8 levels |
| Founding Partner | 9 levels |

**Error handling:**
- Self-referral → reject at code validation (buyer cannot use own code)
- Circular referral → prevented by UNIQUE constraint on `referrals.referred_id`
- Commission calculation failure → log error, retry queue, do not block purchase
- Payout tx failure → mark as 'failed', retry in next cycle, alert admin
- Activity feed: if no events, show "No activity yet" not an error
- Code copy fails (clipboard API blocked) → fallback to select-all prompt

---

### 1.6 Resources Page

**What the UI shows:**
- Partner Materials: Pitch Manual, Brand Assets, T&C (download links)
- Useful Links: Website, Whitepaper, FAQ, Medium
- Community: Telegram, Discord, X
- Compliance notes

**Implementation:**
- Static page, no API calls
- Download links point to CDN-hosted files (S3/CloudFront)
- External links open in new tab
- No dynamic content in Phase 1
- Track download events in analytics (PostHog)

---

### 1.7 Internationalisation (i18n)

**What the UI shows:**
- EN / 繁中 / 简中 language selector in header
- All UI labels translate on switch

**Implementation:**
- Client-side i18n via translation dictionary (current approach)
- Language preference stored in `users.language`, persisted across sessions
- Translation keys on DOM elements via `data-t` attributes
- Numbers, wallet addresses, token symbols never translated
- Right-to-left not needed (no Arabic/Hebrew)

**Phase 1 scope:** 3 languages (EN, TC, SC). Phase 2 adds KO, VI.

---

### 1.8 Infrastructure

| Component | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR for initial load, client-side for dashboard interactions |
| Hosting | Vercel | Edge deployment, preview deployments for PRs |
| Database | Supabase (Postgres) | Row-level security, real-time subscriptions for activity feed |
| Auth | Custom JWT + SIWE | wagmi/viem for wallet interactions |
| Wallet integration | RainbowKit or Dynamic | Multi-wallet, chain switching |
| Chain interaction | viem + wagmi | Contract reads, event listening |
| Event indexer | Custom service or Alchemy webhooks | Listen for NodePurchased events on both chains |
| Cache | Redis (Upstash) | Tier remaining, sale status (10s TTL), wallet balances (30s TTL) |
| File storage | S3 + CloudFront | Pitch manual, brand assets, NFT metadata |
| Analytics | PostHog | Event tracking, funnel analysis, feature flags |
| Error tracking | Sentry | Frontend + backend error capture |
| Domain | app.operon.network | SSL via Vercel |

**Monitoring & alerting:**
- Uptime: Vercel built-in + external ping (UptimeRobot)
- Sale contract balance monitor: alert if treasury receives unexpected tokens
- Tier sellout alert: Telegram notification when a tier sells out
- Commission calculation queue depth: alert if queue exceeds 100 items
- RPC health: failover to backup provider if primary returns errors

---

### 1.9 Security

| Area | Measure |
|---|---|
| Smart contracts | OpenZeppelin base contracts, professional audit before mainnet deployment |
| Admin keys | Multi-sig (3-of-5) for contract admin functions (pause, withdraw) |
| Frontend | CSP headers, no inline scripts in production, subresource integrity |
| API | Rate limiting per IP and per wallet, input validation on all endpoints |
| Database | Row-level security, encrypted at rest, connection pooling |
| Secrets | Environment variables via Vercel, never in repo |
| CORS | Whitelist app.operon.network only |
| JWT | RS256 signing, short expiry, httpOnly cookies |
| Referral code validation | Constant-time comparison to prevent timing attacks |
| Wallet address validation | Checksum verification (EIP-55) before any DB operation |

---

## Phase 2: Public Sale

*Opens to everyone. Community referral codes activate. All 40 tiers.*

### New features:
- **Community referral codes** — auto-generated for every node buyer. Wallet-based or generated code. 10% buyer discount, basic commission (L1: 10%, L2: 3%, L3: 2%, L4: 1%, L5: 1%).
- **All 40 tiers** visible on Sale page (scrollable tier bar, tier selector dropdown for mobile)
- **Per-wallet limits** enforced at smart contract level (Tier 1-3: limits, Tier 4+: unlimited)
- **Real-time tier transitions** — when a tier sells out during the sale, the frontend auto-advances to the next tier. WebSocket or polling with 5s interval.
- **Volume handling** — CDN caching for static assets, database connection pooling, RPC load balancing across multiple providers
- **Fiat onramp consideration** — MoonPay or Alchemy Pay integration for buyers without crypto. Separate payment flow, funds convert to USDC on-chain before calling sale contract.

### Infrastructure additions:
- WebSocket server for real-time tier updates during high-traffic sale
- Backup RPC providers (Alchemy + QuickNode + public RPCs)
- Database read replicas for dashboard queries during peak load
- Rate limit increases for sale endpoints during public sale window
- Stress testing: simulate 10,000 concurrent users on sale page

### Error handling additions:
- High gas prices → show gas warning, suggest waiting or increasing gas limit
- RPC congestion → auto-failover to backup provider, show "Network busy" indicator
- Frontend crash during purchase → pending tx recovery from localStorage on reload
- Multiple browser tabs → prevent duplicate purchases via tab coordination

---

## Phase 3: Post-Sale, Pre-TGE

*Sale closed or sold out. Dashboard shifts from "buy" to "manage."*

### New features:
- **Sale page becomes "Sold Out"** — total raised, total nodes sold, secondary market links (OpenSea)
- **KYC integration** — required before reward claiming. Provider: Sumsub or Synaps. Status indicator in Node Status page.
- **Node delegation interface** — assign node licenses to NaaS providers or self-run. UI: select nodes → choose operator → confirm delegation tx.
- **NaaS provider directory** — list of approved operators with uptime stats, commission rates.
- **Multi-wallet linking** — add additional wallets to aggregate node holdings across wallets.
- **Commission payouts begin** — biweekly Merkle root publication. Partner sees payout status: pending → processing → sent → confirmed. Tx hash linked to explorer.
- **Rewards estimator enhanced** — more accurate projections based on final sell-out numbers, burn mechanism results.

### Smart contract additions:
- **Delegation contract** — allows NFT holder to authorize an operator address without transferring the NFT
- **Merkle distributor** — for biweekly commission payouts. Admin publishes Merkle root, partners claim against proof.
- **Burn mechanism** — if not all 100K nodes sold, burn unsold allocation and redistribute emission proportionally

### Backend additions:
- KYC status tracking (pending, verified, rejected, expired)
- Delegation state indexer — listen for delegation events, update node status
- Merkle tree generator — biweekly job that calculates all commission owed, generates tree, publishes root
- Secondary market price tracker — optional, for showing floor price of node NFTs

### New API endpoints:
```
POST /api/kyc/initiate — redirect to KYC provider
GET  /api/kyc/status — returns verification status
POST /api/nodes/delegate — initiate delegation
GET  /api/nodes/operators — list NaaS providers
POST /api/wallets/link — link additional wallet
GET  /api/payouts/claim-proof — Merkle proof for payout claiming
```

---

## Phase 4: Post-TGE

*$OPRN token is live. Emissions flow. The dashboard becomes operational.*

### New features:
- **Rewards tab** (new sidebar item, replaces "Coming Soon") — total earned, claimable now, claimed to date, vesting schedule, claim button
- **Live emission tracking** — real-time $OPRN accrual per node, daily/weekly/monthly breakdowns
- **Claim interface** — "Claim X $OPRN" button triggers on-chain claim from rewards contract. Two withdrawal options: standard (120-day vest, 100%) or early exit (30-day vest, 50%)
- **Staking tab** (new sidebar item) — stake $OPRN for additional yield. Lock duration selector, APY display, stake/unstake interface
- **Node Operations tab** (new sidebar item) — uptime monitoring, performance metrics, hardware requirements, Checker Client download
- **Commission in $OPRN** — post-TGE commissions paid in $OPRN from Referral & Distribution Pool instead of USDC
- **Token price display** — $OPRN price from DEX (Uniswap/PancakeSwap) displayed in header or relevant pages
- **Portfolio view** — total value: (nodes × floor price) + (staked $OPRN × price) + (unclaimed rewards × price)

### Smart contract additions:
- **Rewards contract** — emission distribution, claiming, vesting logic
- **Staking contract** — lock periods, reward calculation, unstaking cooldown
- **Price oracle** — TWAP from DEX for displaying $OPRN value

### Backend additions:
- Emission distribution service — daily calculation of per-node rewards
- Staking rewards calculator
- Token price feed — DEX price polling every 60s
- Uptime monitoring — ping checker clients, record uptime per node
- Performance scoring — quarterly assessment for bonus eligibility

### New API endpoints:
```
GET  /api/rewards/summary — earned, claimable, claimed, vesting schedule
POST /api/rewards/claim — initiate claim tx
GET  /api/staking/summary — staked amount, rewards, lock expiry
POST /api/staking/stake — initiate stake tx
POST /api/staking/unstake — initiate unstake with cooldown
GET  /api/nodes/uptime — per-node uptime statistics
GET  /api/token/price — current $OPRN price
GET  /api/portfolio/value — total portfolio valuation
```

---

## Phase 5: Ecosystem Maturity

*Platform features that build long-term value and retention.*

### Features:
- **Ecosystem partner rewards** (EcoDrop equivalent) — partner project tokens airdropped to node holders. Dashboard section showing available claims from ecosystem partners.
- **Governance** — $OPRN holders vote on protocol parameters (emission rates, burn schedules, NaaS provider approval). Voting interface in dashboard.
- **Secondary market integration** — in-app node trading via OpenSea SDK or custom marketplace. Floor price, last sale price, listing interface.
- **Node transferability** — after 6-month lock, transfer/sell nodes. Transfer interface in Node Status.
- **Advanced analytics** — emission history charts, portfolio performance over time, referral network visualization (tree diagram).
- **Mobile app** — React Native wrapper around the web dashboard for iOS/Android. Push notifications for tier sellouts, payout arrivals, uptime alerts.
- **Additional languages** — Korean (한국어), Vietnamese (Tiếng Việt), Japanese, Thai
- **In-app bridge** — Li.Fi or Socket integration for cross-chain token swaps without leaving the dashboard.
- **API access for partners** — REST API for large partners to programmatically track their referral network, commission, and node status.

---

## Cross-Phase: Testing & QA

### Smart contract testing:
- Unit tests for all contract functions (Hardhat + Chai)
- Integration tests: full purchase flow on testnet (Arbitrum Sepolia, BSC Testnet)
- Edge case tests: tier boundary transitions, max wallet limits, concurrent purchases
- Gas optimization: benchmark all user-facing functions, target <200K gas per purchase
- Professional security audit before mainnet deployment (Phase 1 blocker)
- Bug bounty programme post-launch (Immunefi)

### Frontend testing:
- E2E tests: Playwright for full purchase flow, wallet connect, language switching
- Component tests: Vitest for isolated component testing
- Visual regression: Chromatic or Percy for UI screenshot comparison
- Accessibility: WCAG 2.1 AA compliance check (keyboard navigation, screen readers, contrast ratios)
- Cross-browser: Chrome, Firefox, Safari, Brave (desktop + mobile)
- Mobile: iOS Safari, Android Chrome, MetaMask mobile browser, Trust Wallet browser

### Load testing:
- Simulate 10,000 concurrent users on sale page (k6 or Artillery)
- Simulate 1,000 simultaneous purchase attempts
- Database query performance under load (index optimization)
- RPC provider rate limits: ensure failover works under real load
- CDN cache hit rates during peak traffic

### Monitoring post-launch:
- Real-time dashboard for: active users, purchase rate, error rate, RPC health
- Alerts: sale contract balance anomaly, tier sellout, error spike, RPC failover triggered
- Daily: commission calculation audit, referral chain integrity check
- Weekly: security review, dependency vulnerability scan
