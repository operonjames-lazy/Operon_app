# Operon Dashboard — User Testing Guide

*Step-by-step guide to get the full system running on testnet and test every feature.*

---

## Prerequisites Completed ✓

- [x] Supabase project created + all 6 migrations run
- [x] Alchemy account (API key configured)
- [x] Upstash Redis (rate limiting configured)
- [x] WalletConnect (project ID configured)
- [x] `.env.local` configured with all credentials
- [x] `pnpm dev` runs successfully at http://localhost:3000
- [x] `/api/health` returns OK for env + database

---

## Step 1: Get Testnet Funds

You need a wallet with test funds on TWO chains. Use the same wallet for both.

### Arbitrum Sepolia (test ETH for gas)
1. Go to [faucet.quicknode.com/arbitrum/sepolia](https://faucet.quicknode.com/arbitrum/sepolia)
2. Connect your MetaMask wallet
3. Request test ETH
4. You should receive ~0.1 ETH on Arbitrum Sepolia
5. Alternative faucet: [sepoliafaucet.com](https://sepoliafaucet.com) → get Sepolia ETH, then bridge via [bridge.arbitrum.io](https://bridge.arbitrum.io)

### BSC Testnet (test BNB for gas)
1. Go to [testnet.bnbchain.org/faucet-smart](https://testnet.bnbchain.org/faucet-smart)
2. Paste your wallet address
3. Request test BNB
4. You should receive ~0.5 tBNB on BSC Testnet

### Add Testnet Networks to MetaMask
If MetaMask doesn't have these networks, add them:

**Arbitrum Sepolia:**
- Network Name: Arbitrum Sepolia
- RPC URL: https://sepolia-rollup.arbitrum.io/rpc
- Chain ID: 421614
- Symbol: ETH
- Explorer: https://sepolia.arbiscan.io

**BSC Testnet:**
- Network Name: BSC Testnet
- RPC URL: https://data-seed-prebsc-1-s1.binance.org:8545
- Chain ID: 97
- Symbol: tBNB
- Explorer: https://testnet.bscscan.com

---

## Step 2: Export Deployer Private Key

1. Open MetaMask → click the three dots menu → Account details
2. Click "Show private key" → enter your MetaMask password
3. Copy the private key (starts with `0x...` or a 64-char hex string)
4. **Keep this safe — never share publicly or commit to git**
5. Come back here and paste it when prompted

---

## Step 3: Deploy Smart Contracts

Once you have testnet funds + private key, the deployment process is:

### 3.1 Deploy to Arbitrum Sepolia
```bash
cd operon-dashboard/contracts

# Create .env file (or we'll do it for you)
# DEPLOYER_PRIVATE_KEY=0xYOUR_KEY
# TREASURY_ADDRESS=0xYOUR_WALLET
# TOKEN_DECIMALS=6

# Deploy mock USDC (testnet only)
npx hardhat run scripts/deploy-mock-usdc.ts --network arbitrumSepolia

# Note the Mock USDC address, then deploy the sale contracts:
USDC_ADDRESS=0x_MOCK_USDC npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

### 3.2 Deploy to BSC Testnet
```bash
# Deploy mock USDC for BSC (18 decimals)
TOKEN_DECIMALS=18 npx hardhat run scripts/deploy-mock-usdc.ts --network bscTestnet

# Deploy sale contracts
TOKEN_DECIMALS=18 USDC_ADDRESS=0x_BSC_MOCK_USDC npx hardhat run scripts/deploy.ts --network bscTestnet
```

### 3.3 Update Environment
After deployment, update `.env.local` with the real contract addresses:
```
NEXT_PUBLIC_SALE_CONTRACT_ARB=0x...
NEXT_PUBLIC_NODE_CONTRACT_ARB=0x...
NEXT_PUBLIC_SALE_CONTRACT_BSC=0x...
NEXT_PUBLIC_NODE_CONTRACT_BSC=0x...
SALE_CONTRACT_ARBITRUM=0x...
SALE_CONTRACT_BSC=0x...
NEXT_PUBLIC_TESTNET_USDC_ARB=0x...
NEXT_PUBLIC_TESTNET_USDC_BSC=0x...
```

---

## Step 4: Mint Test USDC

After deploying mock USDC, mint test tokens to your wallet:

```bash
# Mint 100,000 test USDC on Arbitrum Sepolia
npx hardhat run scripts/mint-test-usdc.ts --network arbitrumSepolia

# Mint 100,000 test USDC on BSC Testnet  
npx hardhat run scripts/mint-test-usdc.ts --network bscTestnet
```

(We'll create this script when we get to this step)

---

## Step 5: Add Referral Code Hash to Contract

The contract validates referral codes by hash. We need to register the test EPP code:

```bash
# Register OPRN-K7VM code hash on both chains
npx hardhat run scripts/register-codes.ts --network arbitrumSepolia
npx hardhat run scripts/register-codes.ts --network bscTestnet
```

(We'll create this script when we get to this step)

---

## Step 6: Test the Full Purchase Flow

### 6.1 Dashboard Check
1. Open http://localhost:3000
2. Connect MetaMask → should connect to Arbitrum Sepolia
3. Home page should show:
   - Sale status: Whitelist, Tier 2 active
   - Referral code section (if logged in as EPP partner)

### 6.2 Purchase Test
1. Navigate to Sale page (/sale)
2. Enter referral code: `OPRN-K7VM`
   - Should show: "Applied -15%"
   - Whitelist notice should appear if no code entered
3. Select chain: Arbitrum
4. Select token: USDC (mock)
5. Set quantity: 1
6. Verify price shows correctly:
   - Tier 2 price: $525 → with 15% off: $446.25
7. Click "Approve USDC"
   - MetaMask pops up → confirm approval
   - Button changes to "Approved ✓"
8. Click "Purchase 1 Node"
   - MetaMask pops up → confirm transaction
   - Wait for block confirmation
   - Success modal: "You now own 1 Operon Node (Tier 2)"

### 6.3 Verify in Database
After purchase, check in Supabase SQL Editor:
```sql
-- Check purchase recorded
SELECT * FROM purchases ORDER BY created_at DESC LIMIT 1;

-- Check tier count updated
SELECT * FROM sale_tiers WHERE tier = 2;

-- Check tier increment logged (idempotency)
SELECT * FROM tier_increments ORDER BY created_at DESC LIMIT 1;
```

### 6.4 Node Status Test
1. Navigate to Nodes page (/nodes)
2. Should show your purchased node(s):
   - Tier, price paid, chain badge, tx hash link to explorer
   - Estimated daily emission

### 6.5 Referrals Test
1. Navigate to Referrals page (/referrals)
2. If connected with David Kim's wallet (0x742d...):
   - Should show EPP partner view with commission data
   - Referral code OPRN-K7VM with copy/share buttons
3. If connected with a different wallet:
   - Should show basic view or "connect wallet" prompt

### 6.6 Tier Sellout Test
1. In Supabase SQL Editor, simulate tier selling out:
   ```sql
   UPDATE sale_tiers SET total_sold = 1249 WHERE tier = 2;
   ```
2. Purchase 1 more node on the sale page
3. After purchase, tier 2 should sell out
4. Real-time notification should appear: "Tier 2 is sold out!"
5. Sale page should auto-advance to Tier 3

### 6.7 Stage Switch Test
1. In Supabase SQL Editor:
   ```sql
   UPDATE sale_config SET stage = 'public', require_code_whitelist = false;
   ```
2. Sale page should update within seconds:
   - Gold "whitelist code required" banner disappears
   - Community codes now accepted (if implemented)
3. Switch back:
   ```sql
   UPDATE sale_config SET stage = 'whitelist', require_code_whitelist = true;
   ```

---

## Step 7: Deploy to Vercel (Live URL)

### 7.1 Push to GitHub
```bash
cd operon-dashboard
git add .
git commit -m "feat: complete Phase 1 with testnet config"
git remote add origin https://github.com/YOUR_USERNAME/operon-dashboard.git
git push -u origin main
```

### 7.2 Connect Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository
3. Root directory: `operon-dashboard`
4. Add ALL environment variables from `.env.local` to Vercel dashboard
5. Deploy

### 7.3 Configure Webhooks (post-deploy)
Once you have a Vercel URL:
1. Set up Alchemy webhook pointing to `https://YOUR_URL/api/webhooks/alchemy`
2. Set up QuickNode stream pointing to `https://YOUR_URL/api/webhooks/quicknode`
3. Add the signing keys to Vercel env vars

---

## Test Checklist Summary

| # | Test | Status |
|---|------|--------|
| 1 | Dashboard loads at localhost:3000 | ✅ Done |
| 2 | Wallet connects via MetaMask | |
| 3 | Sale page shows Tier 2 active, correct pricing | |
| 4 | Referral code OPRN-K7VM validates with 15% discount | |
| 5 | Mock USDC approval transaction succeeds | |
| 6 | Node purchase transaction succeeds | |
| 7 | Success modal appears after block confirmation | |
| 8 | Node appears on Nodes page | |
| 9 | Purchase recorded in Supabase | |
| 10 | Tier count incremented (idempotent) | |
| 11 | Commission attributed to referrer | |
| 12 | Tier sellout triggers Realtime notification | |
| 13 | Stage switch updates UI in real-time | |
| 14 | Health check returns 200 | |
| 15 | Rate limiting works (11th code validation returns 429) | |
| 16 | Language switch persists across page reload | |
| 17 | Mobile layout: bottom nav + sidebar toggle work | |
| 18 | Pending tx recovery from localStorage works | |
| 19 | BSC Testnet purchase works (same flow, different chain) | |
| 20 | Vercel deployment live and functional | |

---

## Troubleshooting

### "Connect Wallet" button doesn't work
- Make sure WalletConnect Project ID is set in `.env.local`
- Restart dev server after changing env vars: `pnpm dev`

### Sale page shows $0 or no tiers
- Check Supabase has data: `SELECT * FROM sale_tiers;`
- Check `.env.local` has correct Supabase URL and service key

### Transaction fails with "execution reverted"
- Ensure contracts are deployed and addresses updated in `.env.local`
- Ensure mock USDC is minted to your wallet
- Ensure referral code hash is registered on the contract

### Realtime notifications don't appear
- Check Supabase Realtime is enabled (Settings → Realtime)
- Ensure `sale_tiers` and `sale_config` are in the Realtime publication
- Check browser console for WebSocket errors

### Rate limiting not working
- Check Upstash credentials in `.env.local`
- Rate limiting is skipped if Upstash env vars are missing (dev fallback)
