# Testnet Deployment — Step-by-Step Checklist

*Everything you need to do to get the full purchase flow working on testnet. Follow in order.*

**Current status:**
- ✅ Dashboard live on Vercel
- ✅ Supabase database connected with seed data
- ✅ All API endpoints working
- ❌ Smart contracts NOT deployed yet — this is what we're doing now

---

## STEP 1: Get a Testnet Wallet Ready

You'll use the SAME MetaMask wallet for everything.

### 1.1 Choose your deployer wallet
- Open MetaMask
- Use an existing account OR create a new one for testing
- **Copy your wallet address** (e.g., `0x742d...2bD38`) — you'll need it

### 1.2 Add testnet networks to MetaMask

**Arbitrum Sepolia** (if not already added):
1. Open MetaMask → Settings → Networks → Add Network
2. Fill in:
   - Network Name: `Arbitrum Sepolia`
   - RPC URL: `https://sepolia-rollup.arbitrum.io/rpc`
   - Chain ID: `421614`
   - Currency Symbol: `ETH`
   - Block Explorer: `https://sepolia.arbiscan.io`
3. Save

**BSC Testnet** (if not already added):
1. Same process:
   - Network Name: `BSC Testnet`
   - RPC URL: `https://data-seed-prebsc-1-s1.binance.org:8545`
   - Chain ID: `97`
   - Currency Symbol: `tBNB`
   - Block Explorer: `https://testnet.bscscan.com`

---

## STEP 2: Get Testnet Gas Tokens (FREE)

You need small amounts of test ETH and test BNB for gas fees. These are free.

### 2.1 Arbitrum Sepolia ETH
1. Go to **https://faucet.quicknode.com/arbitrum/sepolia**
2. Connect your MetaMask (or paste your address)
3. Click "Request" — you'll get ~0.1 test ETH
4. Wait ~30 seconds, check MetaMask on Arbitrum Sepolia network
5. **If that faucet doesn't work**, try:
   - https://www.alchemy.com/faucets/arbitrum-sepolia (requires Alchemy login)
   - https://sepoliafaucet.com (get Sepolia ETH first, then bridge)

### 2.2 BSC Testnet BNB
1. Go to **https://testnet.bnbchain.org/faucet-smart**
2. Paste your wallet address
3. Select "0.5 BNB"
4. Complete the CAPTCHA and click "Give me BNB"
5. Wait ~30 seconds, check MetaMask on BSC Testnet network

### 2.3 Verify you have funds
- Switch MetaMask to **Arbitrum Sepolia** → should see > 0 ETH
- Switch MetaMask to **BSC Testnet** → should see > 0 tBNB

---

## STEP 3: Export Your Private Key

The deploy scripts need your private key to sign transactions.

1. Open MetaMask
2. Click the three dots (⋮) next to your account name
3. Click **"Account details"**
4. Click **"Show private key"**
5. Enter your MetaMask password
6. **Copy the private key** (64 hex characters, may or may not start with `0x`)

⚠️ **NEVER share this publicly or commit it to git.** It's only used locally for testnet deployment.

---

## STEP 4: Deploy Contracts

### 4.1 Create contracts `.env` file

In your terminal (Claude will do this for you):
```bash
cd operon-dashboard/contracts
```

Create a `.env` file with:
```
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
TREASURY_ADDRESS=0xYOUR_WALLET_ADDRESS_HERE
```

### 4.2 Deploy Mock USDC on Arbitrum Sepolia

We need a test stablecoin since real USDC doesn't exist on testnets.

```bash
TOKEN_DECIMALS=6 npx hardhat run scripts/deploy-mock-usdc.ts --network arbitrumSepolia
```

**Expected output:**
```
Deploying Mock USDC with account: 0xYOUR_ADDRESS
Mock USDC deployed to: 0xMOCK_USDC_ARB_ADDRESS
Minted 1,000,000 USDC to 0xYOUR_ADDRESS

--- Use this address as USDC_ADDRESS in deploy.ts ---
USDC_ADDRESS=0xMOCK_USDC_ARB_ADDRESS
```

📝 **Write down the Mock USDC address.**

### 4.3 Deploy Sale Contracts on Arbitrum Sepolia

```bash
TOKEN_DECIMALS=6 USDC_ADDRESS=0xMOCK_USDC_ARB_ADDRESS npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

**Expected output:**
```
Deploying contracts with account: 0xYOUR_ADDRESS
OperonNode deployed to: 0xNODE_ARB_ADDRESS
NodeSale deployed to: 0xSALE_ARB_ADDRESS
Minter set to NodeSale: 0xSALE_ARB_ADDRESS
NodeContract set on NodeSale: 0xNODE_ARB_ADDRESS
USDC accepted: 0xMOCK_USDC_ARB_ADDRESS
Tier 0 set: price=500000000 supply=1250 active=true
...

--- Deployment Summary ---
OperonNode: 0xNODE_ARB_ADDRESS
NodeSale: 0xSALE_ARB_ADDRESS
Treasury: 0xYOUR_ADDRESS
```

📝 **Write down ALL three addresses** (OperonNode, NodeSale, Mock USDC).

### 4.4 Deploy Mock USDC on BSC Testnet

```bash
TOKEN_DECIMALS=18 npx hardhat run scripts/deploy-mock-usdc.ts --network bscTestnet
```

📝 **Write down the BSC Mock USDC address.**

### 4.5 Deploy Sale Contracts on BSC Testnet

```bash
TOKEN_DECIMALS=18 USDC_ADDRESS=0xMOCK_USDC_BSC_ADDRESS npx hardhat run scripts/deploy.ts --network bscTestnet
```

📝 **Write down the BSC OperonNode + NodeSale addresses.**

### 4.6 Verify Contracts on Block Explorer (optional but recommended)

Arbitrum Sepolia:
```bash
npx hardhat verify --network arbitrumSepolia 0xNODE_ARB_ADDRESS
npx hardhat verify --network arbitrumSepolia 0xSALE_ARB_ADDRESS "0xYOUR_TREASURY_ADDRESS"
```

BSC Testnet:
```bash
npx hardhat verify --network bscTestnet 0xNODE_BSC_ADDRESS
npx hardhat verify --network bscTestnet 0xSALE_BSC_ADDRESS "0xYOUR_TREASURY_ADDRESS"
```

---

## STEP 5: Register Referral Code on Contracts

The contract needs to know valid referral code hashes. Register the test EPP code `OPRN-K7VM`:

### 5.1 Create the registration script

Claude will create `contracts/scripts/register-codes.ts` for you. It:
1. Computes `keccak256("OPRN-K7VM")` — the code hash
2. Calls `nodeSale.addReferralCode(hash, 1500)` — registers with 15% discount

### 5.2 Run on both chains

```bash
SALE_ADDRESS=0xSALE_ARB_ADDRESS npx hardhat run scripts/register-codes.ts --network arbitrumSepolia
SALE_ADDRESS=0xSALE_BSC_ADDRESS npx hardhat run scripts/register-codes.ts --network bscTestnet
```

---

## STEP 6: Update Environment Variables

### 6.1 Update `.env.local` (local dev)

Add/update these values with your deployed addresses:

```
# Arbitrum Sepolia contracts
NEXT_PUBLIC_SALE_CONTRACT_ARB=0xSALE_ARB_ADDRESS
NEXT_PUBLIC_NODE_CONTRACT_ARB=0xNODE_ARB_ADDRESS
SALE_CONTRACT_ARBITRUM=0xSALE_ARB_ADDRESS

# BSC Testnet contracts
NEXT_PUBLIC_SALE_CONTRACT_BSC=0xSALE_BSC_ADDRESS
NEXT_PUBLIC_NODE_CONTRACT_BSC=0xNODE_BSC_ADDRESS
SALE_CONTRACT_BSC=0xSALE_BSC_ADDRESS

# Mock USDC addresses (testnet only)
NEXT_PUBLIC_TESTNET_USDC_ARB=0xMOCK_USDC_ARB_ADDRESS
NEXT_PUBLIC_TESTNET_USDT_ARB=0xMOCK_USDC_ARB_ADDRESS
NEXT_PUBLIC_TESTNET_USDC_BSC=0xMOCK_USDC_BSC_ADDRESS
NEXT_PUBLIC_TESTNET_USDT_BSC=0xMOCK_USDC_BSC_ADDRESS
```

(We use the same mock USDC address for both USDC and USDT slots since it's testnet.)

### 6.2 Update Vercel env vars

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add ALL the same variables from 6.1
3. Click **Save**
4. Go to **Deployments** → click the latest → **Redeploy** (or push a new commit)

### 6.3 Verify contracts are recognized

```bash
curl https://YOUR_VERCEL_URL/api/health
```

Should now show `contracts: { status: 'ok' }` instead of `warn`.

---

## STEP 7: Mint Test USDC to Your Wallet

You need test USDC in your wallet to buy nodes.

### 7.1 Mint on Arbitrum Sepolia

Claude will create `contracts/scripts/mint-test-usdc.ts` for you. Or manually:

```bash
npx hardhat console --network arbitrumSepolia
```

Then in the console:
```javascript
const USDC = await ethers.getContractAt("MockERC20", "0xMOCK_USDC_ARB_ADDRESS");
await USDC.mint("0xYOUR_WALLET", ethers.parseUnits("100000", 6)); // 100,000 USDC
```

### 7.2 Mint on BSC Testnet

Same process:
```bash
npx hardhat console --network bscTestnet
```

```javascript
const USDC = await ethers.getContractAt("MockERC20", "0xMOCK_USDC_BSC_ADDRESS");
await USDC.mint("0xYOUR_WALLET", ethers.parseUnits("100000", 18)); // 100,000 USDC (18 decimals on BSC)
```

### 7.3 Add Mock USDC to MetaMask

So you can see your test USDC balance:
1. Switch MetaMask to Arbitrum Sepolia
2. Click "Import tokens" at the bottom
3. Paste the Mock USDC contract address
4. Symbol: `USDC`, Decimals: `6`
5. You should see 100,000 USDC

Repeat for BSC Testnet (decimals: `18`).

---

## STEP 8: Test the Full Purchase Flow

### 8.1 Open the dashboard
- Go to your Vercel URL OR `http://localhost:3000`
- Connect MetaMask (should auto-trigger SIWE sign-in)

### 8.2 Navigate to Sale page
- Click "Sale" in the sidebar
- You should see: Tier 2 active, $525 price, 847 remaining

### 8.3 Enter referral code
- Type `OPRN-K7VM` in the code input
- Should show green "Applied -15%" badge
- Price should drop to ~$446

### 8.4 Configure purchase
- Chain: Arbitrum (MetaMask should be on Arbitrum Sepolia)
- Quantity: 1
- Token: USDC
- Balance should show your 100,000 USDC

### 8.5 Approve USDC
- Click "Approve USDC"
- MetaMask popup → confirm the approval transaction
- Wait for confirmation → button changes to "Approved ✓"

### 8.6 Purchase node
- Click "Purchase 1 Node"
- MetaMask popup → confirm the purchase transaction
- Wait for block confirmation
- 🎉 Success modal: "You now own 1 Operon Node (Tier 2)"

### 8.7 Verify post-purchase
- Click "View My Nodes" → should show your node
- Check the database:
  ```sql
  SELECT * FROM purchases ORDER BY created_at DESC LIMIT 1;
  SELECT * FROM sale_tiers WHERE tier = 2; -- total_sold should have incremented
  ```

---

## STEP 9: Test Webhook Integration (Optional)

This requires Alchemy/QuickNode webhook setup, which needs the Vercel URL.

### 9.1 Set up Alchemy webhook
1. Go to [dashboard.alchemy.com](https://dashboard.alchemy.com)
2. Create an Alchemy app for **Arbitrum Sepolia**
3. Go to Notify → Webhooks → Create Webhook
4. Chain: Arbitrum Sepolia
5. Type: Address Activity
6. Address: Your NodeSale contract address on Arbitrum Sepolia
7. Webhook URL: `https://YOUR_VERCEL_URL/api/webhooks/alchemy`
8. Copy the **signing key**

### 9.2 Add signing key to Vercel
- Add env var: `ALCHEMY_WEBHOOK_SIGNING_KEY=your_key`
- Redeploy

### 9.3 Test
- Make a purchase on the dashboard
- Check Alchemy webhook dashboard → should show "delivered"
- Check Supabase → purchase + commission records should appear

---

## STEP 10: Test Stage Switching

### 10.1 Switch to public sale
In Supabase SQL Editor:
```sql
UPDATE sale_config SET stage = 'public', require_code_whitelist = false;
```

- Dashboard should update within seconds (Realtime)
- "Whitelist Live" badge disappears
- Code requirement notice disappears
- Users can buy without referral code

### 10.2 Switch back to whitelist
```sql
UPDATE sale_config SET stage = 'whitelist', require_code_whitelist = true;
```

---

## STEP 11: Test Tier Sellout

### 11.1 Simulate near-sellout
In Supabase SQL Editor:
```sql
UPDATE sale_tiers SET total_sold = 1249 WHERE tier = 2;
```

### 11.2 Buy the last node
- Go to Sale page, buy 1 node
- After purchase, Tier 2 should sell out
- Realtime notification: "Tier 2 is sold out!"
- UI auto-advances to Tier 3

### 11.3 Verify auto-advance
```sql
SELECT tier, total_sold, total_supply, is_active FROM sale_tiers ORDER BY tier;
```
- Tier 2: `is_active = false`, `total_sold = 1250`
- Tier 3: `is_active = true`

---

## Summary: What You Need to Give Claude

To deploy contracts, share these with Claude:

1. **Your deployer wallet private key** (from MetaMask, Step 3)
2. **Your wallet address** (for treasury and minting)
3. Confirmation that you have **testnet ETH** (Arbitrum Sepolia) and **testnet BNB** (BSC Testnet)

Claude will then:
- Create the contracts `.env` file
- Deploy Mock USDC on both chains
- Deploy OperonNode + NodeSale on both chains
- Register the test referral code
- Update all environment variables
- Mint test USDC to your wallet
- Push to GitHub → Vercel auto-deploys

**Total time: ~15 minutes once you have testnet funds.**

---

## Troubleshooting

### "Insufficient funds for gas" during deploy
- You don't have enough test ETH/BNB. Get more from the faucets.

### Contract deploy fails with "nonce too low"
- Previous transaction is still pending. Wait 1 minute and retry.

### "execution reverted" during purchase
- Check: Is the tier active? (`sale_tiers.is_active = true`)
- Check: Does the contract have the referral code registered?
- Check: Is the Mock USDC address accepted by the sale contract?

### MetaMask shows wrong network
- Make sure you added Arbitrum Sepolia (chain ID 421614) and BSC Testnet (chain ID 97)
- The dashboard is in testnet mode (`NEXT_PUBLIC_NETWORK_MODE=testnet`)

### Wallet connected but dashboard shows "Not authenticated"
- The SIWE signing may have failed — check browser console
- Try disconnecting and reconnecting the wallet
- Clear `operon_auth_token` from localStorage and refresh

### Tier count not updating after purchase
- Webhook not configured yet? The cron job runs daily on Vercel hobby tier
- For immediate testing, call: `GET /api/cron/reconcile` with the CRON_SECRET header
