# Operon Dashboard — Deployment & Testnet Guide

*Step-by-step guide to get the full system running on testnet with real infrastructure.*

---

## Prerequisites

You'll need accounts on:
- [Vercel](https://vercel.com) — frontend hosting (free tier works)
- [Supabase](https://supabase.com) — database (free tier works)
- [Alchemy](https://alchemy.com) — Arbitrum RPC + webhooks (free tier works)
- [QuickNode](https://quicknode.com) — BSC RPC + webhooks (free tier works)
- [Upstash](https://upstash.com) — Redis for rate limiting (free tier works)
- [WalletConnect Cloud](https://cloud.walletconnect.com) — project ID (free)

You'll also need:
- A testnet wallet with ETH on Arbitrum Sepolia and BNB on BSC Testnet
- Testnet USDC (get from faucets — see Step 4)

---

## Step 1: Supabase Setup

### 1.1 Create Project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create new project → name it `operon-dashboard`
3. Choose a region close to your users (e.g., Singapore for APAC)
4. Note your **project URL** and **anon key** (Settings → API)
5. Note your **service role key** (Settings → API → under "service_role")

### 1.2 Run Migrations
Go to SQL Editor and run each file in order:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_seed_data.sql
supabase/migrations/003_functions.sql
supabase/migrations/004_fixes.sql
supabase/migrations/005_sale_config.sql
supabase/migrations/006_resilience.sql
```

**Important:** Run them one at a time. If 002 fails on the seed data (FK constraints), ensure 001 completed fully first.

### 1.3 Enable Realtime
Go to Database → Replication → and ensure these tables are in the `supabase_realtime` publication:
- `sale_tiers`
- `sale_config`

(Migration 005 attempts this, but verify manually.)

---

## Step 2: Upstash Redis Setup

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a Redis database (free tier, choose nearest region)
3. Note the **REST URL** and **REST Token** from the dashboard

---

## Step 3: WalletConnect Setup

1. Go to [cloud.walletconnect.com](https://cloud.walletconnect.com)
2. Create a new project → name it `Operon Dashboard`
3. Note your **Project ID**

---

## Step 4: Deploy Smart Contracts to Testnets

### 4.1 Get Testnet Funds
- **Arbitrum Sepolia ETH:** [faucet.quicknode.com/arbitrum/sepolia](https://faucet.quicknode.com/arbitrum/sepolia)
- **BSC Testnet BNB:** [testnet.bnbchain.org/faucet-smart](https://testnet.bnbchain.org/faucet-smart)

### 4.2 Get Testnet Stablecoins
For testnet, we'll deploy a mock USDC:

```bash
cd operon-dashboard/contracts
```

Create a `.env` file in the contracts/ directory:
```
DEPLOYER_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
TREASURY_ADDRESS=0xYOUR_WALLET_ADDRESS
TOKEN_DECIMALS=6
```

### 4.3 Deploy to Arbitrum Sepolia
```bash
# Deploy mock USDC first (for testnet only)
npx hardhat run scripts/deploy-mock-usdc.ts --network arbitrumSepolia

# Note the USDC address, then:
USDC_ADDRESS=0x_MOCK_USDC_ADDRESS npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

### 4.4 Deploy to BSC Testnet
```bash
TOKEN_DECIMALS=18 USDC_ADDRESS=0x_MOCK_USDC_ADDRESS npx hardhat run scripts/deploy.ts --network bscTestnet
```

### 4.5 Record Contract Addresses
After deployment, note all addresses:
```
Arbitrum Sepolia:
  OperonNode: 0x...
  NodeSale:   0x...
  Mock USDC:  0x...

BSC Testnet:
  OperonNode: 0x...
  NodeSale:   0x...
  Mock USDC:  0x...
```

---

## Step 5: Configure Environment

Create `.env.local` in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# Auth
JWT_SECRET=generate-with-openssl-rand-base64-32

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=YOUR_PROJECT_ID

# RPC (testnet)
NEXT_PUBLIC_ALCHEMY_KEY=YOUR_ALCHEMY_KEY
ARBITRUM_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
BSC_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# Contract Addresses (from Step 4)
SALE_CONTRACT_ARBITRUM=0x...
SALE_CONTRACT_BSC=0x...
NODE_CONTRACT_ARBITRUM=0x...
NODE_CONTRACT_BSC=0x...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://YOUR_REDIS.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN

# Cron
CRON_SECRET=generate-a-random-string

# Webhooks (set after Step 6)
ALCHEMY_WEBHOOK_SIGNING_KEY=
QUICKNODE_WEBHOOK_SECRET=
```

Generate JWT_SECRET:
```bash
openssl rand -base64 32
```

---

## Step 6: Update Frontend Contract Config

Update `lib/wagmi/contracts.ts` with your deployed testnet addresses:

```typescript
// For testnet, update SALE_CONTRACT_ADDRESSES and NODE_CONTRACT_ADDRESSES
// Also update STABLECOIN_ADDRESSES with your mock USDC addresses
```

Also update `lib/wagmi/config.ts` to use testnet chains:
- Replace `arbitrum` with `arbitrumSepolia` 
- Replace `bsc` with `bscTestnet`

---

## Step 7: Deploy to Vercel

### 7.1 Connect Repository
1. Push the project to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the repository
4. Set root directory to `operon-dashboard`
5. Framework: Next.js (auto-detected)

### 7.2 Add Environment Variables
In Vercel dashboard → Settings → Environment Variables, add ALL variables from `.env.local`.

### 7.3 Deploy
Vercel auto-deploys on push. Your preview URL will be something like:
```
https://operon-dashboard-XXXX.vercel.app
```

---

## Step 8: Configure Webhooks

### 8.1 Alchemy Webhook (Arbitrum)
1. Go to [dashboard.alchemy.com](https://dashboard.alchemy.com) → Notify → Webhooks
2. Create a new webhook:
   - Chain: Arbitrum Sepolia
   - Type: Address Activity
   - Address: Your NodeSale contract address on Arbitrum Sepolia
   - Webhook URL: `https://YOUR_VERCEL_URL/api/webhooks/alchemy`
3. Note the **signing key** → update `ALCHEMY_WEBHOOK_SIGNING_KEY` in Vercel env vars

### 8.2 QuickNode Stream (BSC)
1. Go to [dashboard.quicknode.com](https://dashboard.quicknode.com) → Streams
2. Create a new stream:
   - Chain: BSC Testnet
   - Filter: Contract address = your NodeSale on BSC Testnet
   - Destination: `https://YOUR_VERCEL_URL/api/webhooks/quicknode`
3. Note the **webhook secret** → update `QUICKNODE_WEBHOOK_SECRET` in Vercel env vars

---

## Step 9: End-to-End Test

### Test Checklist

```
[ ] 1. Open the dashboard URL in browser
[ ] 2. Connect wallet (MetaMask with Arbitrum Sepolia)
[ ] 3. Verify home page loads with sale status
[ ] 4. Go to Sale page
[ ] 5. Enter referral code OPRN-K7VM (from seed data)
[ ] 6. Verify 15% discount applied
[ ] 7. Select chain: Arbitrum
[ ] 8. Select token: USDC (mock)
[ ] 9. Set quantity: 1
[ ] 10. Click Approve → confirm in MetaMask
[ ] 11. Click Purchase → confirm in MetaMask
[ ] 12. Wait for block confirmation → success modal appears
[ ] 13. Check Nodes page → node appears in inventory
[ ] 14. Check database → purchase record in `purchases` table
[ ] 15. Check database → referral_purchases record (commission attributed)
[ ] 16. Check database → sale_tiers.total_sold incremented
[ ] 17. Verify tier_increments table has the tx_hash (idempotency)
[ ] 18. Trigger reconciliation: GET /api/cron/reconcile (with CRON_SECRET)
[ ] 19. Verify reconciliation_log entry created
[ ] 20. Check /api/health → returns 200 with all checks OK
```

### Test Tier Sellout
1. Set tier 0 supply to 2 (via Supabase SQL editor: `UPDATE sale_tiers SET total_supply = 2 WHERE tier = 1`)
2. Buy 2 nodes → tier 0 should sell out
3. Verify Realtime notification appears: "Tier 1 is sold out!"
4. Verify tier 1 auto-advances to active

### Test Stage Switch
```sql
UPDATE sale_config SET stage = 'public', require_code_whitelist = false;
```
Verify: sale page updates within seconds, code requirement banner disappears.

---

## Step 10: Security Audit Prep

Once testnet is validated, prepare the audit package:

### Audit Package Contents
1. `contracts/contracts/OperonNode.sol` + `NodeSale.sol`
2. `contracts/test/NodeSale.test.ts` (43 tests)
3. Deployment addresses on testnet
4. Architecture diagram (from CLAUDE.md)
5. Admin function inventory (see below)

### Admin Function Inventory
```
OperonNode.sol:
  - setMinter(address) — onlyOwner
  - setTransferLockExpiry(uint256) — onlyOwner
  - pause() / unpause() — onlyOwner

NodeSale.sol:
  - setTier(uint256, uint256, uint256, bool) — onlyOwner
  - setTierActive(uint256, bool) — onlyOwner
  - setTierPaused(uint256, bool) — onlyOwner
  - setMaxPerWallet(uint256, uint256) — onlyOwner
  - setMaxBatchSize(uint256) — onlyOwner
  - addReferralCode(bytes32, uint16) — onlyOwner
  - addReferralCodes(bytes32[], uint16) — onlyOwner
  - setAcceptedToken(address, bool) — onlyOwner
  - setTreasury(address) — onlyOwner
  - setNodeContract(address) — onlyOwner
  - withdrawFunds(address, address) — onlyOwner
  - pause() / unpause() — onlyOwner

Both contracts use Ownable2Step:
  - transferOwnership(address) → pendingOwner must call acceptOwnership()
```

### Recommended Audit Firms
- **Trail of Bits** — premium, 4-6 week lead time
- **OpenZeppelin** — premium, 4-6 week lead time
- **Cyfrin** — mid-range, 2-4 week lead time
- **Code4rena** — competitive audit, 1-2 week setup
- **Sherlock** — competitive audit, 1-2 week setup

**Budget:** $15K-$50K depending on firm and scope.
**Schedule:** Start audit during testnet validation to parallelize.
