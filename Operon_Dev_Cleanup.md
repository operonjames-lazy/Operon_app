# Operon — Senior Dev Cleanup Pass

*Fixes every gap identified in the review. This file supplements the existing docs.*

---

## 1. Unified SQL Migration

Single file. All tables from Technical Scope + EPP Backend Spec + Missing Specs + the missing `sale_tiers` table. Copy this into `supabase/migrations/001_initial_schema.sql`.

```sql
-- ═══ SALE ═══

CREATE TABLE sale_tiers (
  tier          INTEGER PRIMARY KEY,
  price_usd     INTEGER NOT NULL,          -- in cents (50000 = $500.00)
  total_supply  INTEGER NOT NULL,          -- combined cap across both chains
  total_sold    INTEGER NOT NULL DEFAULT 0, -- combined count across both chains
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed whitelist tiers
INSERT INTO sale_tiers (tier, price_usd, total_supply, is_active) VALUES
  (1, 50000, 1250, TRUE),
  (2, 52500, 1250, FALSE),
  (3, 55125, 1250, FALSE),
  (4, 57881, 1250, FALSE),
  (5, 60775, 1250, FALSE);
-- Public tiers (6-40) seeded separately via script

-- ═══ USERS ═══

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_wallet  VARCHAR(42) NOT NULL UNIQUE,
  email           VARCHAR(255),
  display_name    VARCHAR(100),
  language        VARCHAR(5) DEFAULT 'en',
  payout_chain    VARCHAR(10) DEFAULT 'arbitrum',
  is_epp          BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  wallet_address  VARCHAR(42) NOT NULL UNIQUE,
  chain           VARCHAR(10) NOT NULL,
  is_primary      BOOLEAN DEFAULT FALSE,
  added_at        TIMESTAMPTZ DEFAULT now()
);

-- ═══ EPP ═══

CREATE TABLE epp_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code     VARCHAR(20) NOT NULL UNIQUE,  -- EPP-XXXX
  intended_name   VARCHAR(100),
  intended_email  VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'pending', -- pending, used, expired
  created_at      TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

CREATE TABLE epp_partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id),
  invite_id       UUID REFERENCES epp_invites(id),
  referral_code   VARCHAR(20) NOT NULL UNIQUE,  -- OPRN-XXXX
  tier            VARCHAR(20) NOT NULL DEFAULT 'affiliate',
  credited_amount INTEGER NOT NULL DEFAULT 0,    -- cents
  payout_wallet   VARCHAR(42) NOT NULL,
  payout_chain    VARCHAR(10) NOT NULL DEFAULT 'arbitrum',
  telegram        VARCHAR(100),
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ REFERRALS ═══

CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES users(id),
  referred_id     UUID NOT NULL UNIQUE REFERENCES users(id), -- each user referred once only
  level           INTEGER NOT NULL,   -- 1 = direct
  code_used       VARCHAR(20) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- ═══ PURCHASES ═══

CREATE TABLE purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  tx_hash         VARCHAR(66) NOT NULL UNIQUE,  -- idempotency key
  chain           VARCHAR(10) NOT NULL,
  tier            INTEGER NOT NULL,
  quantity        INTEGER NOT NULL,
  token           VARCHAR(10) NOT NULL,          -- USDC or USDT
  amount_usd      INTEGER NOT NULL,              -- cents, after discount
  discount_bps    INTEGER NOT NULL DEFAULT 0,
  code_used       VARCHAR(20),
  block_number    BIGINT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_purchases_user ON purchases(user_id);

-- ═══ COMMISSIONS ═══

CREATE TABLE referral_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL REFERENCES purchases(id),
  purchase_tx     VARCHAR(66) NOT NULL,
  referrer_id     UUID NOT NULL REFERENCES users(id),
  
  -- Calculation inputs (for audit replay)
  level           INTEGER NOT NULL,
  referrer_tier   VARCHAR(20) NOT NULL,    -- tier AT TIME of purchase
  commission_rate INTEGER NOT NULL,         -- bps (1200 = 12%)
  credited_weight INTEGER NOT NULL,         -- bps (10000 = 100%)
  net_amount_usd  INTEGER NOT NULL,         -- purchase amount in cents

  -- Calculation outputs
  commission_usd  INTEGER NOT NULL,         -- cents
  credited_amount INTEGER NOT NULL,         -- cents
  
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(purchase_tx, level)                -- idempotency
);

CREATE INDEX idx_ref_purchases_referrer ON referral_purchases(referrer_id);

-- ═══ PAYOUTS ═══

CREATE TABLE payout_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          VARCHAR(20) DEFAULT 'calculating',
  total_amount    INTEGER,                  -- cents
  partner_count   INTEGER,
  approved_by     VARCHAR(100),
  approved_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payout_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       UUID NOT NULL REFERENCES payout_periods(id),
  partner_id      UUID NOT NULL REFERENCES users(id),
  amount          INTEGER NOT NULL,         -- cents
  wallet          VARCHAR(42) NOT NULL,
  chain           VARCHAR(10) NOT NULL,
  tx_hash         VARCHAR(66),
  status          VARCHAR(20) DEFAULT 'pending',
  sent_at         TIMESTAMPTZ
);

-- ═══ ADMIN ═══

CREATE TABLE admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user      VARCHAR(100) NOT NULL,
  action          VARCHAR(100) NOT NULL,
  target_type     VARCHAR(50),
  target_id       VARCHAR(100),
  details         JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reconciliation_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain           VARCHAR(10) NOT NULL,
  from_block      BIGINT NOT NULL,
  to_block        BIGINT NOT NULL,
  events_found    INTEGER NOT NULL,
  gaps_filled     INTEGER NOT NULL DEFAULT 0,
  run_at          TIMESTAMPTZ NOT NULL,
  duration_ms     INTEGER
);

-- ═══ ANNOUNCEMENTS ═══

CREATE TABLE announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_en      TEXT NOT NULL,
  message_tc      TEXT,
  message_sc      TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 2. Seed Data (from dashboard sample state)

```sql
-- seed.sql — matches the dashboard UI reference

-- Test user (EPP partner)
INSERT INTO users (id, primary_wallet, email, display_name, language, is_epp) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38', 'david@example.com', 'David Kim', 'en', TRUE);

-- EPP partner record
INSERT INTO epp_partners (id, user_id, referral_code, tier, credited_amount, payout_wallet, payout_chain) VALUES
  ('b2c3d4e5-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000001', 'OPRN-K7VM', 'affiliate', 133800, '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38', 'bsc');

-- 3 purchases (from referrals using David's code)
INSERT INTO purchases (user_id, tx_hash, chain, tier, quantity, token, amount_usd, discount_bps, code_used, block_number) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000002', '0xaaa1', 'arbitrum', 2, 2, 'USDC', 89250, 1500, 'OPRN-K7VM', 18234567),
  ('a1b2c3d4-0000-0000-0000-000000000003', '0xaaa2', 'bsc', 2, 1, 'USDC', 44625, 1500, 'OPRN-K7VM', 42000100);

-- Referral records
INSERT INTO referrals (referrer_id, referred_id, level, code_used) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000002', 1, 'OPRN-K7VM'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000003', 1, 'OPRN-K7VM');

-- Commission records (L1 at 12%)
INSERT INTO referral_purchases (purchase_id, purchase_tx, referrer_id, level, referrer_tier, commission_rate, credited_weight, net_amount_usd, commission_usd, credited_amount) VALUES
  ((SELECT id FROM purchases WHERE tx_hash='0xaaa1'), '0xaaa1', 'a1b2c3d4-0000-0000-0000-000000000001', 1, 'affiliate', 1200, 10000, 89250, 10710, 89250),
  ((SELECT id FROM purchases WHERE tx_hash='0xaaa2'), '0xaaa2', 'a1b2c3d4-0000-0000-0000-000000000001', 1, 'affiliate', 1200, 10000, 44625, 5355, 44625);

-- Update sale_tiers to match dashboard state
UPDATE sale_tiers SET total_sold = 1250, is_active = FALSE WHERE tier = 1;
UPDATE sale_tiers SET total_sold = 403, is_active = TRUE WHERE tier = 2;
```

---

## 3. Referral Pool Emission Formula

```
Total emission pool: 10% of total $OPRN supply = 4,200,000,000 $OPRN
Distributed over 4 years with same 40/30/20/10 schedule.

Year 1 daily pool = 4,200,000,000 × 40% / 365 = 4,602,739.73 $OPRN/day

User's share = (nodes referred by user / total nodes sold) × daily pool

Example from dashboard:
- David referred 3 nodes (via his code)
- Assume 1,000 total nodes sold so far
- Daily pool share = (3 / 1,000) × 4,602,739.73 = 13,808.22 $OPRN/day

Note: The dashboard shows ~20.7 $OPRN/day for referral pool. This implies
a different calculation or a smaller pool. The exact formula should be
confirmed with the tokenomics team before implementation. For the UI,
use the backend API response — don't calculate on the frontend.
```

---

## 4. EPP Onboarding → Dashboard Handoff

```
1. Partner completes onboarding at /onboarding?code=EPP-XXXX&name=David
2. Backend creates: users row + epp_partners row + generates referral code
3. Confirmation screen shows: "Account created" + referral code + "Log in" button
4. "Log in" button links to: app.operon.network?ref=OPRN-K7VM
5. Dashboard loads → shows "Connect Wallet" prompt (RainbowKit modal)
6. Partner connects the SAME wallet they entered during onboarding
7. Backend: SIWE signature → lookup wallet in users table → find epp_partners record → issue JWT with is_epp=true
8. Dashboard renders EPP view (Referrals tab shows partner status card, programme reference)

What if they connect a DIFFERENT wallet?
- New user created with that wallet. No EPP record found.
- They see the basic buyer dashboard, not the EPP view.
- Support case: admin links the wallets manually.

What if they haven't connected a wallet yet?
- Dashboard shows Home page in visitor mode: sale info + "Connect wallet to continue"
- Purchase Node tab shows hero pricing but "Connect wallet to buy"
- Referrals tab hidden (no identity confirmed)
```

---

## 5. Webhook Payload Parsing

### Alchemy (Arbitrum)

```typescript
// Alchemy sends a custom activity webhook
interface AlchemyWebhookPayload {
  webhookId: string;
  id: string;
  createdAt: string;
  type: 'ADDRESS_ACTIVITY';
  event: {
    network: 'ARB_MAINNET';
    activity: Array<{
      category: 'token' | 'internal' | 'external';
      fromAddress: string;
      toAddress: string;
      value: number;
      asset: string;
      hash: string;
      log: {
        address: string;   // contract address
        topics: string[];  // event signature + indexed params
        data: string;      // non-indexed params (ABI encoded)
        blockNumber: string;
        transactionHash: string;
        logIndex: string;
      };
    }>;
  };
}

// Extract purchase event from webhook
function parseAlchemyPurchase(payload: AlchemyWebhookPayload) {
  for (const activity of payload.event.activity) {
    if (activity.log?.address?.toLowerCase() === SALE_CONTRACT_ARB.toLowerCase()) {
      // Decode the event using the sale contract ABI
      const iface = new ethers.Interface(NodeSaleABI);
      const parsed = iface.parseLog({
        topics: activity.log.topics,
        data: activity.log.data,
      });
      if (parsed?.name === 'NodePurchased') {
        return {
          txHash: activity.hash,
          buyer: parsed.args.buyer,
          tier: Number(parsed.args.tier),
          quantity: Number(parsed.args.quantity),
          totalPaid: parsed.args.totalPaid,
          codeHash: parsed.args.codeHash,
          blockNumber: parseInt(activity.log.blockNumber, 16),
        };
      }
    }
  }
  return null;
}
```

### QuickNode (BSC)

```typescript
// QuickNode sends raw log data via Stream
interface QuickNodeStreamPayload {
  matchedReceipts: Array<{
    transactionHash: string;
    blockNumber: number;
    logs: Array<{
      address: string;
      topics: string[];
      data: string;
      logIndex: number;
    }>;
  }>;
}

function parseQuickNodePurchase(payload: QuickNodeStreamPayload) {
  for (const receipt of payload.matchedReceipts) {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === SALE_CONTRACT_BSC.toLowerCase()) {
        const iface = new ethers.Interface(NodeSaleABI);
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'NodePurchased') {
          return {
            txHash: receipt.transactionHash,
            buyer: parsed.args.buyer,
            tier: Number(parsed.args.tier),
            quantity: Number(parsed.args.quantity),
            totalPaid: parsed.args.totalPaid,
            codeHash: parsed.args.codeHash,
            blockNumber: receipt.blockNumber,
          };
        }
      }
    }
  }
  return null;
}
```

---

## 6. Error Messages (i18n)

Add to `lib/i18n/errors.ts`:

```typescript
export const ERROR_MESSAGES = {
  en: {
    WRONG_CHAIN: 'Switch to {chain} to continue',
    INSUFFICIENT_BALANCE: 'You need {amount} more {token}',
    INSUFFICIENT_GAS: 'Not enough {token} for gas. You need ~{amount}.',
    TIER_SOLD_OUT: 'Tier {tier} just sold out. Moved to Tier {nextTier} at {price}.',
    WALLET_LIMIT: 'Maximum {limit} nodes per wallet for this tier.',
    SALE_PAUSED: 'Sale is temporarily paused. Check back shortly.',
    CODE_INVALID: 'This referral code is not valid.',
    CODE_NO_WHITELIST: 'This code does not have whitelist access.',
    TX_REVERTED: 'Transaction failed: {reason}. No funds were charged.',
    TX_TIMEOUT: 'Network is congested. Retrying...',
    APPROVAL_REJECTED: 'Approval cancelled. Try again.',
    TX_REJECTED: 'Transaction cancelled.',
  },
  tc: {
    WRONG_CHAIN: '請切換至 {chain} 以繼續',
    INSUFFICIENT_BALANCE: '需要額外 {amount} {token}',
    INSUFFICIENT_GAS: '{token} 不足以支付 Gas 費，需約 {amount}。',
    TIER_SOLD_OUT: '第 {tier} 層已售完，已移至第 {nextTier} 層，價格為 {price}。',
    WALLET_LIMIT: '此層級每個錢包最多 {limit} 個節點。',
    SALE_PAUSED: '銷售暫時停止，請稍後再試。',
    CODE_INVALID: '此推薦碼無效。',
    CODE_NO_WHITELIST: '此推薦碼不具白名單資格。',
    TX_REVERTED: '交易失敗：{reason}。未扣除任何資金。',
    TX_TIMEOUT: '網路擁塞，正在重試⋯',
    APPROVAL_REJECTED: '授權已取消，請重試。',
    TX_REJECTED: '交易已取消。',
  },
  sc: {
    WRONG_CHAIN: '请切换至 {chain} 以继续',
    INSUFFICIENT_BALANCE: '需要额外 {amount} {token}',
    INSUFFICIENT_GAS: '{token} 不足以支付 Gas 费，需约 {amount}。',
    TIER_SOLD_OUT: '第 {tier} 层已售完，已移至第 {nextTier} 层，价格为 {price}。',
    WALLET_LIMIT: '此层级每个钱包最多 {limit} 个节点。',
    SALE_PAUSED: '销售暂时停止，请稍后再试。',
    CODE_INVALID: '此推荐码无效。',
    CODE_NO_WHITELIST: '此推荐码不具白名单资格。',
    TX_REVERTED: '交易失败：{reason}。未扣除任何资金。',
    TX_TIMEOUT: '网络拥塞，正在重试…',
    APPROVAL_REJECTED: '授权已取消，请重试。',
    TX_REJECTED: '交易已取消。',
  },
};
```

---

## 7. Contract Deployment Checklist

### Per chain (run twice: Arbitrum + BSC)

```
PRE-DEPLOYMENT
[ ] Multi-sig wallet created (3-of-5 Gnosis Safe)
[ ] USDC + USDT contract addresses verified for this chain
[ ] Gas funded in deployer wallet
[ ] Hardhat config verified for this network

DEPLOY
[ ] Deploy OperonNode.sol → note address
[ ] Verify contract on block explorer
[ ] Deploy NodeSale.sol (constructor args: node NFT address, treasury address, USDC address, USDT address) → note address
[ ] Verify contract on block explorer

CONFIGURE
[ ] NodeSale: call setNodeContract(OperonNode address)
[ ] OperonNode: call setMinter(NodeSale address) — only the sale contract can mint
[ ] NodeSale: call setTierActive(1, true) — activate Tier 1
[ ] NodeSale: load all EPP referral code hashes via addReferralCodes([...])
[ ] NodeSale: set per-wallet limits for Tiers 1-3

TRANSFER OWNERSHIP
[ ] OperonNode: transferOwnership → multi-sig address
[ ] OperonNode: multi-sig accepts ownership (acceptOwnership on Ownable2Step)
[ ] NodeSale: transferOwnership → multi-sig address
[ ] NodeSale: multi-sig accepts ownership

VERIFY
[ ] Test purchase with 0.01 USDC on mainnet (tiny amount)
[ ] Confirm NFT minted to buyer wallet
[ ] Confirm sale_tiers counter incremented in backend
[ ] Confirm referral attribution ran for test purchase
[ ] Pause sale contract (multi-sig)
[ ] Unpause sale contract (multi-sig) — confirm pause/unpause works

BACKEND
[ ] Update .env with contract addresses for this chain
[ ] Alchemy/QuickNode webhook pointed to this contract address
[ ] Verify webhook fires on test purchase
[ ] Verify reconciliation cron picks up the test purchase

FRONTEND
[ ] Update NEXT_PUBLIC contract address env vars
[ ] Verify dashboard shows correct tier pricing from this chain's contract
[ ] Verify purchase flow works end-to-end on this chain
```

### Post-deployment (both chains)

```
[ ] Collective quota: verify sale_tiers table tracks combined count
[ ] Test: buy on Arbitrum → check combined count → buy on BSC → verify total
[ ] Admin: Retool connected and showing live data
[ ] Monitoring: Sentry catching errors, PostHog tracking events
[ ] Alert: Telegram bot posting tier sellout notifications
[ ] Final: remove test purchases from database (or mark as test)
[ ] Go live: announce to first EPP partners
```

---

## 8. API Route Naming Fix

Rename the route group from `(dashboard)` to `(app)` to avoid collision with the `/api/dashboard/` prefix.

```
BEFORE:
app/(dashboard)/page.tsx        ← Home
app/api/dashboard/summary.ts    ← API

AFTER:
app/(app)/page.tsx              ← Home  
app/api/home/summary.ts         ← API (renamed from dashboard)
```

Updated CLAUDE.md project structure:
```
app/
├── (app)/              ← Dashboard layout group (was "dashboard")
│   ├── layout.tsx
│   ├── page.tsx        ← Home
│   ├── sale/page.tsx
│   ├── nodes/page.tsx
│   ├── referrals/page.tsx
│   └── resources/page.tsx
├── api/
│   ├── auth/
│   ├── home/summary/route.ts     ← was dashboard/summary
│   ├── sale/
│   ├── nodes/
│   ├── referrals/
│   ├── webhooks/
│   └── cron/
```
