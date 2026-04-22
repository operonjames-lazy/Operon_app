# TESTING_GUIDE.md — Operon Phase 1 (cycle 2)

**Who this is for:** Anyone helping us test the Operon app before real money goes live. You need a computer, a browser, and about half a day total (roughly 2 hours of setup, then 1–2 hours of clicking through tests).

**What you're doing:** Installing the Operon app on your own laptop, setting up crypto wallets on two practice blockchains (Arbitrum Sepolia and BSC Testnet), then testing the crucial money paths: buying a node, using a referral link, seeing the discount, and checking that commissions land on the correct wallet. Everything else is already covered by automated tests. You are only testing things that need a human with eyes and a wallet.

**Why this matters:** When this goes live, people will be paying real money on two different blockchains. A silent failure on launch day — wrong commission, premature "Successful" message, missing discount — is close to impossible to fix after the fact. Your job is to break this stuff now.

**What's different from cycle 1:** This is the second pass of user testing. The first pass (2026-04-14) surfaced 14 bugs; all of them have been fixed, the code has been re-reviewed end-to-end, and this package reflects the fixed state. Two items in Part 3 setup are new — **read Part 3 carefully even if you tested cycle 1**. A known-caveats list is in Part 10 at the bottom of this guide — those are items that have been intentionally deferred for later, not bugs we want you to report. Part 7 is new and covers the common "looks like a bug but isn't" situations you'll hit — **read Part 7 before you file a report.**

**You will not need to understand code.** You will copy and paste commands. If something fails, message the operator — do not improvise.

---

## Part 0 — What you have in this package

The `operon-dashboard/` folder next to this file is the full application codebase. You do **not** need to `git clone` anything — skip that step in any other doc you may have been handed.

> **Note for the operator packaging this folder:** before handing it off, delete any `.env.local` that may have been left in the `operon-dashboard/` root. That file can contain live Supabase service keys and Upstash tokens; testers make their own per §3.6 and should never receive someone else's creds.

---

## Part 1 — Install the tools you need

Five things. Skip any you already have.

### 1.1 Node.js (version 22 LTS or later)

1. Go to **nodejs.org** → download the **LTS** version → install.
2. Open a terminal and verify:
   ```
   node --version
   ```
   On Windows, use **Git Bash** (installed with Git in 1.3). Not PowerShell, not CMD — many commands in this guide will not work in those.

### 1.2 pnpm

```
npm install -g pnpm
```
Verify: `pnpm --version` should be 9 or higher.

### 1.3 Git (and Git Bash on Windows)

Download from **git-scm.com/downloads**. On Windows the installer also puts **Git Bash** on your Start menu — use that for every command in this guide.

### 1.4 MetaMask browser extension

1. **metamask.io** → Download → install.
2. Pin the extension to your browser toolbar (puzzle piece icon → pin).
3. Create a new wallet. Write the 12-word recovery phrase on paper. Set a password.

### 1.5 A code editor (optional)

You will edit one config file. Any editor works. If you need one, grab **VS Code** from **code.visualstudio.com**.

---

## Part 2 — Set up your wallets

You need **three wallets** in MetaMask:

- **Deployer** — deploys the smart contracts. Also your admin wallet.
- **Wallet A** — top of the referral chain.
- **Wallet B** — referred by Wallet A.

### 2.1 Create three MetaMask accounts

MetaMask icon → account circle (top-right) → **Add a new account** → name it **Deployer**. Repeat twice more for **Wallet A** and **Wallet B**.

> ⚠️ **Important behaviour note (new in cycle 2):** The app expects you to sign out before switching wallets. **When you want to switch from Wallet A to Wallet B, click the Disconnect button in the app (or in the wallet icon at the top right of the page) first, THEN switch accounts in MetaMask.** If you just switch the active account in MetaMask while the app is still showing a signed-in state for the previous wallet, the app now detects the account change and forces a re-sign — which is the correct safe behaviour but may feel like a jolt. Disconnecting first is the smoother flow.

### 2.2 Add Arbitrum Sepolia to MetaMask

Network dropdown → **Add a custom network**:

- **Name:** Arbitrum Sepolia
- **RPC URL:** `https://sepolia-rollup.arbitrum.io/rpc`
- **Chain ID:** `421614`
- **Currency:** ETH
- **Explorer:** `https://sepolia.arbiscan.io`

### 2.3 Add BSC Testnet to MetaMask

- **Name:** BSC Testnet
- **RPC URL:** `https://data-seed-prebsc-1-s1.binance.org:8545`
- **Chain ID:** `97`
- **Currency:** tBNB
- **Explorer:** `https://testnet.bscscan.com`

### 2.4 Fund all three wallets on both chains

Each wallet needs a small amount of the native coin on each chain to pay network fees.

**Arbitrum Sepolia faucet:** `https://www.alchemy.com/faucets/arbitrum-sepolia` (or ask the operator for a backup). Switch MetaMask to Arbitrum Sepolia, copy each wallet address in turn, request funds from the faucet for all three.

**BSC Testnet faucet:** `https://testnet.bnbchain.org/faucet-smart`. Switch MetaMask to BSC Testnet. Request funds for all three wallets.

After this, all three accounts should show small ETH balances on Arbitrum and small tBNB balances on BSC.

### 2.5 Export the Deployer's private key

1. MetaMask → Deployer account → three-dot menu → **Account details** → **Show private key**.
2. Copy it (starts with `0x`). Paste it into a temporary text file — you will need it in Part 3.
3. **Delete that file when you are done with this guide.** The Deployer wallet is for testing only — never put real funds in it.

---

## Part 3 — Deploy the Operon app

This is the one-time setup. Follow it exactly. If anything fails, copy the error and ask the operator — do not improvise.

### 3.1 Install dependencies

The operator handed you the `operon-dashboard/` folder inside this package. Open a Git Bash terminal in it:

```
cd operon-dashboard
pnpm install
```

A single `pnpm install` at the repo root installs both the app and the `contracts/` workspace (via `pnpm-workspace.yaml`). Takes a few minutes.

### 3.2 Create a free Supabase project

Supabase is the database the app uses.

1. **supabase.com** → sign up → **New project**.
2. Name: anything. Database password: generate and save it. Region: closest to you.
3. Wait ~1 minute for provisioning.
4. Left sidebar → gear icon (**Project Settings**) → **API**. Save these three values — you need them in step 3.6:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_KEY`
5. **Project Settings → Database → Connection string → URI tab**. Copy the string. Replace `[YOUR-PASSWORD]` with the database password from step 2. This is your `SUPABASE_DB_URL`.

### 3.3 Deploy the smart contracts on Arbitrum Sepolia

From the `contracts` folder:

```
cd contracts
export DEPLOYER_PRIVATE_KEY=<paste the 0x... key from Part 2.5>
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
```

**Deploy a mock USDC token:**
```
npx hardhat run scripts/deploy-mock-usdc.ts --network arbitrumSepolia
```
Save the printed address as `USDC_ARB`.

**Deploy the main contracts:**
```
export USDC_ADDRESS=<USDC_ARB>
export TOKEN_DECIMALS=6
export TREASURY_ADDRESS=<the Deployer wallet address>
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```
Save the two printed addresses as `SALE_ARB` and `NODE_ARB`.

### 3.4 Deploy the smart contracts on BSC Testnet

Same again, but **use the BSC-specific mock script** (symbol USDT, 18 decimals). The Arbitrum script (`deploy-mock-usdc.ts`) hardcodes 6 decimals, which mismatches BSC's `TOKEN_DECIMALS=18` and makes every purchase fail.

```
npx hardhat run scripts/deploy-mock-usdt.ts --network bscTestnet
```
Save as `USDT_BSC`.

**Before you run the next block**, open a fresh terminal (or run `unset USDC_ADDRESS TOKEN_DECIMALS`). `deploy.ts` is chain-agnostic and reads whichever env var you set below — if the Arbitrum values from §3.3 are still exported in this shell, the BSC deploy will silently use the wrong address.

```
unset USDC_ADDRESS TOKEN_DECIMALS
export USDC_ADDRESS=<USDT_BSC>
export TOKEN_DECIMALS=18
npx hardhat run scripts/deploy.ts --network bscTestnet
```
Save as `SALE_BSC` and `NODE_BSC`.

*(Yes, the env var is named `USDC_ADDRESS` even though on BSC you're passing the USDT address. `deploy.ts` treats it as "the accepted stablecoin address for this chain" regardless of which symbol it is. Don't let the name confuse you.)*

**You should now have six addresses:** `USDC_ARB`, `SALE_ARB`, `NODE_ARB`, `USDT_BSC`, `SALE_BSC`, `NODE_BSC`.

### 3.5 Mint practice stablecoins

Still in `contracts`, open the Hardhat console for Arbitrum:
```
npx hardhat console --network arbitrumSepolia
```
Paste these, replacing the addresses. One command per line:
```
const usdc = await ethers.getContractAt("MockERC20", "<USDC_ARB>")
await usdc.mint("<Deployer address>", "10000000000")
await usdc.mint("<Wallet A address>", "10000000000")
await usdc.mint("<Wallet B address>", "10000000000")
```
That gives each wallet 10,000 practice USDC (6 decimals). Type `.exit`.

Now BSC — **note the extra zeros because BSC uses 18 decimals**:
```
npx hardhat console --network bscTestnet
const usdt = await ethers.getContractAt("MockERC20", "<USDT_BSC>")
await usdt.mint("<Deployer address>", "10000000000000000000000")
await usdt.mint("<Wallet A address>", "10000000000000000000000")
await usdt.mint("<Wallet B address>", "10000000000000000000000")
```
Type `.exit`, then:
```
cd ..
```

### 3.6 Create the frontend config file

In the project root (not `contracts`), create a file called exactly **`.env.local`** (note the leading dot). Paste this, filling in your values:

```
NEXT_PUBLIC_NETWORK_MODE=testnet

NEXT_PUBLIC_SUPABASE_URL=<from 3.2>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from 3.2>
SUPABASE_SERVICE_KEY=<from 3.2>
SUPABASE_DB_URL=<from 3.2>

JWT_SECRET=<see below>
# IMPORTANT: do not leave JWT_SECRET as the placeholder in .env.example.
# Generate a fresh random value (instructions below this code block).
# If you leave the placeholder, anyone who sees your .env.local can forge
# your login session — low stakes on testnet, but please still do it.

NEXT_PUBLIC_SALE_CONTRACT_ARB=<SALE_ARB>
NEXT_PUBLIC_NODE_CONTRACT_ARB=<NODE_ARB>
NEXT_PUBLIC_TESTNET_USDC_ARB=<USDC_ARB>

NEXT_PUBLIC_SALE_CONTRACT_BSC=<SALE_BSC>
NEXT_PUBLIC_NODE_CONTRACT_BSC=<NODE_BSC>
NEXT_PUBLIC_TESTNET_USDT_BSC=<USDT_BSC>

# Same contract addresses but read server-side (no NEXT_PUBLIC_ prefix).
# The Next.js API routes, the reconcile cron, and pnpm dev:indexer all
# read these — set them to the same values as above.
SALE_CONTRACT_ARBITRUM=<SALE_ARB>
SALE_CONTRACT_BSC=<SALE_BSC>

ADMIN_WALLETS=<Deployer address, all lowercase>
ADMIN_PRIVATE_KEY=<Deployer private key from 2.5>

# ── NEW in cycle 2 — gate for local dev endpoints ──────────────
# The dev event indexer posts signed messages to /api/dev/indexer-ingest
# and /api/dev/drain-referrals. Both routes now require these two flags
# AND a valid HMAC signature. Skip either one and nothing moves locally.
# Both variables must be LOCAL ONLY — never set in a Vercel or cloud deploy.
DEV_ENDPOINTS_ENABLED=1
DEV_INDEXER_SECRET=<see below>

# ── Optional but STRONGLY RECOMMENDED — private RPCs ──────────
# The app and the dev-indexer fall back to free public RPC endpoints
# (e.g. sepolia-rollup.arbitrum.io, publicnode BSC) when these are unset.
# Public RPCs rate-limit under sustained polling — during a 2-4 hour test
# session you WILL hit 429s, which show up as "code never syncs" or
# "NFT never appears" false alarms. Spend 2 minutes getting a free
# Alchemy key for Arbitrum and a free QuickNode / Infura endpoint for
# BSC; paste the URLs here.
#
#   Arbitrum Sepolia via Alchemy: https://www.alchemy.com/ → Arbitrum Sepolia app
#   BSC Testnet via QuickNode:    https://www.quicknode.com/ → BSC Testnet endpoint
#
ARBITRUM_RPC_URL=
BSC_RPC_URL=
```

Generate `JWT_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Paste the output into the `JWT_SECRET=` line.

Generate `DEV_INDEXER_SECRET` the same way — a **second** random 32-byte hex string (not the same as JWT_SECRET):
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Paste that output into the `DEV_INDEXER_SECRET=` line.

**Double-check:** `ADMIN_WALLETS` must be **all lowercase**. MetaMask shows mixed case — convert it.

### 3.7 Apply the database migrations

Easiest way is Supabase's SQL editor, not the terminal.

1. Open your Supabase project in the browser.
2. Left sidebar → **SQL Editor** → **New query**.
3. In your file manager, open the folder `operon-dashboard/supabase/migrations`. You will see files named `001_initial_schema.sql`, `002_seed_data.sql`, etc.
4. Open `001_initial_schema.sql` in a text editor. Select all. Copy. Paste into the Supabase SQL Editor. Click **Run**.
5. Wait for **Success**.
6. Clear the editor. Repeat for each remaining file **in numerical order**: 002, 003, 004, 005, 006, 008, 009, 010, 011, 012, 013, 014, 015, 016, 017. **There is no 007 — skip it.**

If any file errors, stop and message the operator.

Notes:
- `002_seed_data.sql` pre-seeds a handful of EPP invite codes into the database. You can use those in Test 5 without generating new ones. It also inserts demo rows (a fake "David Kim" EPP partner, two fake historical purchases) purely for dashboard screenshots — ignore them, they don't affect Tests 1–6.
- `013_referral_chain_state.sql` creates the queue that tracks whether a referral code has been mirrored onto the sale contract. `014_seed_full_tier_curve.sql` fills in tiers 6–40 and resets tier state so the DB lines up with a fresh contract deploy.
- `017_guard_tier_reset.sql` is the compensating control for `014` — it makes `014`'s tier-state reset skip if any real purchases already exist, so re-running the migration list mid-session does not corrupt counters. Must be applied after `016`.

### 3.8 Run the site

From the project root:
```
pnpm dev
```
After 20–30 seconds you will see `Local: http://localhost:3001`. Open that URL in your browser. You should see the Operon homepage. Ignore any terminal warnings about Sentry.

**Leave this terminal running** for the whole test session. Closing it stops the site.

### 3.8.1 Start the local event indexer (**required**, or purchases won't appear on the site)

Vercel cron and the Alchemy / QuickNode webhooks cannot reach `localhost`, so the test environment needs a local event poller. **Open a second terminal window** (leave the `pnpm dev` shell from §3.8 running) and from the project root run:

```
pnpm dev:indexer
```

This polls both testnets every ~5 seconds for new `NodePurchased` events and forwards anything new to the dev server. You should see `[dev-indexer] starting …` within a second or two.

**New in cycle 2 — sanity check.** The first line printed after startup tells you whether the indexer picked up the HMAC secret. If you see:

> `[dev-indexer] DEV_INDEXER_SECRET is not set in .env.local`

stop and fix your `.env.local` — the indexer cannot run without it. If the script ran past that banner, you're good.

**Without this step, Test 3 purchases will appear to disappear** — MetaMask will show the NFT minted and the USDC / USDT deducted, but the site's dashboard, transaction history, and referral activity will all stay empty. That was bug #13 in cycle 1 and it is expected in any local-dev setup that forgets the indexer.

### 3.9 Import the practice tokens into MetaMask

MetaMask does not show the practice USDC / USDT balances until you tell it which tokens to track.

**On Arbitrum Sepolia**, for each of the three wallets:
1. Switch MetaMask to Arbitrum Sepolia and select the wallet.
2. Scroll down in MetaMask → **Import tokens** → paste `USDC_ARB` → **Import**.
3. You should see ~10,000 USDC.

**On BSC Testnet**, for each of the three wallets:
1. Switch to BSC Testnet and select the wallet.
2. Import tokens → paste `USDT_BSC` → **Import**.
3. You should see ~10,000 USDT.

---

## Part 4 — Checklist before you start testing

- [ ] Site running at `http://localhost:3001`
- [ ] Second terminal running `pnpm dev:indexer` with no "DEV_INDEXER_SECRET not set" error
- [ ] MetaMask has three accounts: Deployer, Wallet A, Wallet B
- [ ] MetaMask has Arbitrum Sepolia and BSC Testnet networks added
- [ ] All three wallets have some ETH on Arbitrum and some tBNB on BSC
- [ ] All three wallets show ~10,000 USDC on Arbitrum and ~10,000 USDT on BSC
- [ ] You have the six contract addresses written down somewhere
- [ ] All migrations were run including 016 (the latest) — if you stopped early you will hit bugs
- [ ] `.env.local` has both `DEV_ENDPOINTS_ENABLED=1` and `DEV_INDEXER_SECRET=<hex>`

---

## Part 5 — Red flags — stop and report immediately

If you see any of these, stop, screenshot, and message the operator. These are the launch-day disasters.

1. **"Purchase successful" appears before MetaMask confirms the transaction** — or worse, when the transaction failed or was never submitted.
2. **MetaMask approval popup shows the wrong amount.** Look at the **human-readable amount** MetaMask displays near the top (formatted like `95 USDC` or `95 USDT`). It should roughly match the price on the Sale page. **RED FLAG** if:
   - It says **Unlimited**
   - MetaMask warns "this site is requesting unlimited access"
   - The human-readable amount is clearly many times larger than the price
   - *(BSC note: because USDT uses 18 decimals, the raw number underneath the formatted amount is long — e.g. `95000000000000000000` for $95. That is normal. Trust the formatted amount, not the raw digits.)*
3. **You paid and there's no NFT on the My Nodes page** after waiting two minutes. (Before reporting: check the `pnpm dev:indexer` terminal — if it's dead or full of errors, restart it and wait another 30 seconds.)
4. **A referral commission lands on the wrong wallet**, on your own wallet when you used your own code, or the amount is clearly wrong (zero, negative, or many times larger than expected).
5. **The price on the Sale page does not match what MetaMask asks you to pay.**
6. **After a successful purchase, your USDC/USDT balance did not go down by the price shown**, or went down by a wildly different amount.
7. **Raw code text on the screen** — `sale.buyButton`, `{{discount}}`, `[object Object]`, `undefined`.
8. **You switched to a non-English language and still see English** in a button, heading, or menu. **(Cycle 2 fixed 17 missing sale-page translation keys — if you still see English on a non-EN page, it is a genuine bug and we want the report.)**
9. **An Arbitrum purchase shows up as a BSC NFT or vice versa**, or commission amounts on BSC differ from Arbitrum by many orders of magnitude (this is almost always a decimals bug).
10. **You paid and nothing happened** — no NFT, no error, no pending state, no success.
11. **Switching MetaMask accounts while signed in leaves you still viewing the previous wallet's data.** If you change accounts in MetaMask and the /referrals or /nodes page still shows the previous wallet's nodes/commissions, that is the cross-wallet bleed bug and we need to know about it. (Cycle 2 added a defense against this — it forces a re-sign on account change. If the re-sign prompt does NOT appear, that's the red flag.)

---

## Part 6 — Tests

Six tests. Run them in order — earlier tests set up state for later ones. Each test has a **Goal**, **Steps**, and **Pass/Fail checks** marked with ☐.

The tests only cover things a human with a browser and a wallet can verify. Contract logic, backend math, rate limiting, authorization, and signature verification are already covered by automated tests — do not bother manually testing those.

**Useful tip — the Sale page has a Chain Selector.** To switch between Arbitrum and BSC while testing, use the **in-app Chain Selector** on the Sale page, not MetaMask's network dropdown. If your wallet is on the wrong network, the site will show a "Switch to X" button — click it and approve in MetaMask. This is the smoother flow.

---

### Test 1 — Sign in and get a referral code

**Goal:** A new wallet can connect, sign, and receive its own `OPR-XXXXXX` referral code.

**Setup:** MetaMask on Arbitrum Sepolia, Wallet A selected.

**Steps:**

1. Open an Incognito window (Ctrl+Shift+N).
2. Go to `http://localhost:3001`.
3. Click **Connect Wallet** → **MetaMask** → **Connect**.
4. MetaMask pops up a second time asking you to **Sign** a message. Click **Sign**.
5. Click **Referrals** in the menu.

**Checks:**

- ☐ A code starting with `OPR-` and 6 characters is shown. Write it down — you need it in Test 2.
- ☐ Your Wallet A address is visible on the page.
- ☐ **Fail if:** no code, blank code, wrong format, or wrong wallet address shown.

---

### Test 2 — Referral link and discount

**Goal:** Visiting with `?ref=OPR-XXXXXX` in the URL attaches the correct referrer and shows a 10% discount on the Sale page. Self-referral is rejected.

**Steps:**

1. New Incognito window.
2. Go to `http://localhost:3001/?ref=<the code from Test 1>`.
3. Click **Connect Wallet** → **MetaMask** → pick **Wallet B** → **Connect** → **Sign**.
4. Click **Sale** in the menu.

**Checks:**

- ☐ The Sale page shows a **10% discount** applied (line-through on the original price, green "10% off" badge).
- ☐ Wallet A's code appears in the referral code badge at the top of the buy box (e.g. `OPR-ABC123 ✓`).
- ☐ **Fail if:** no discount, wrong percentage, no referrer shown, or a different code shown.

**Wait time note — new in cycle 2.** The first purchase with a brand new code may hit a "pending sync" state for 5–15 seconds while the `dev:indexer` pushes the code onto the contract. If you see a red "activating your code on-chain" toast, just wait and it'll flip green automatically. Do not re-click or refresh aggressively.

**Now try one thing to break it — self-referral:**

1. Sign out Wallet B (use the Disconnect button, not just MetaMask). New Incognito window.
2. Go to `http://localhost:3001/?ref=<Wallet A's own code>`.
3. Sign in with **Wallet A** — the wallet that owns that code.
4. Go to the Sale page.

- ☐ Expect: no discount (the 10% should DISAPPEAR the moment you finish signing — cycle 2 re-runs the self-ref check post-sign-in).
- ☐ **Fail if:** a 10% discount is still applied after you sign in, or Wallet A ends up as its own referrer on the Referrals page.

---

### Test 3 — Buy a node, receive referral credit (run twice)

**Goal:** The core money path — approve, purchase, get the NFT, referrer gets their commission. Run once on Arbitrum with USDC (quantity 1), then once on BSC with USDT (quantity 3). These are the two places real money will move at launch. The decimals difference between the chains and the quantity multiplication are the two most common sources of silent bugs.

---

#### Pass 1 — Arbitrum Sepolia + USDC + quantity 1

**Setup:** Sign in as Wallet B (referred by Wallet A from Test 2). Go to the Sale page. Use the **in-app Chain Selector** to pick **Arbitrum**. If MetaMask is on a different network, click the "Switch to Arbitrum" button and approve in MetaMask.

Confirm the referrer and 10% discount are still shown.

**Before clicking anything, write down Wallet B's current USDC balance** — you can see it on the payment-token button next to "USDC — $10,000.00" or similar. Call this `balance_before`.

**Steps:**

1. Pick **quantity: 1**.
2. Pick **USDC** as the token.
3. **Write down the total price shown on the Sale page.** Example: `$95.00`.
4. Click **Approve**.
5. **Look carefully at the MetaMask approval popup.** Near the top, MetaMask shows a human-readable amount like `95 USDC`. It should roughly match the price from step 3.
   - ☐ **STOP AND REPORT** (Red Flag #2) if: it says **Unlimited**, warns about "unlimited access," or shows an amount clearly larger than the price.
6. Click **Confirm** in MetaMask. Wait for the approve transaction to confirm.
7. Click **Purchase** on the website.
8. MetaMask pops up again. Click **Confirm**.
9. **Watch the website while MetaMask is still processing.** The site should show a spinner or "Confirming" state. Only **after** MetaMask shows the transaction as confirmed should it flip to the Purchase Complete modal.
   - ☐ **STOP AND REPORT** (Red Flag #1) if: the website says "Successful" before MetaMask confirms.

**Pass or fail checks:**

- ☐ Go to **My Nodes**. One NFT is listed, owned by Wallet B, on Arbitrum.
- ☐ Go back to the Sale page and check the USDC balance shown on the payment-token button — call this `balance_after`. **`balance_before - balance_after` should roughly equal the price** you wrote down in step 3. A few cents of rounding is fine. **RED FLAG #6** if the balance barely dropped, or dropped by many times the price.
- ☐ Go to **Referrals** (still as Wallet B). The purchase appears in your activity.
- ☐ Disconnect, sign in with **Wallet A**. Go to **Referrals**.
- ☐ Wallet B's purchase appears in your activity feed.
- ☐ A commission amount is shown on Wallet A. **Expected: approximately $8.55** (L1 community rate is 10%, applied to the post-discount price of ~$85.50). A few cents of rounding is fine. Anything between **$8 and $10** is acceptable; outside that range, note the actual number and report.
- ☐ **Fail if:** no NFT, no referral entry on Wallet A, commission is zero (the chain walk is broken), negative, or many times larger than the purchase price.

---

#### Pass 2 — BSC Testnet + USDT + quantity 3

**Setup:** Still signed in as Wallet B. On the Sale page, use the **in-app Chain Selector** to switch to **BNB Chain**. If MetaMask is still on Arbitrum, the site will show a "Switch to BNB Chain" button — click it, approve the network switch in MetaMask.

Confirm the referrer and 10% discount are still shown after the chain change — this is a check that referral state survives chain switches.

Write down Wallet B's current **USDT** balance as `balance_before`.

**Steps:**

1. Pick **quantity: 3** (this test deliberately buys multiple to verify multiplication).
2. Pick **USDT** as the token.
3. **Write down the total price shown.** It should be roughly 3× the per-node price minus the 10% discount. Example: `$256.50` for 3 nodes at $95 each with 10% off. The Sale page also shows the per-node price underneath the quantity selector — sanity-check it.
4. Click **Approve**.
5. MetaMask approval popup:
   - ☐ The **formatted** amount near the top should read roughly `256.50 USDT` or similar — matching the total price.
   - ☐ **Reminder:** because USDT on BSC uses 18 decimals, the raw number in the transaction data is long (e.g. `256500000000000000000`). That is normal. Trust the formatted amount.
   - ☐ **STOP AND REPORT** (Red Flag #2) if it says **Unlimited** or the formatted amount is wildly wrong.
6. Confirm approve. Wait. Click **Purchase**. Confirm. Watch for premature success.

**Pass or fail checks:**

- ☐ **My Nodes** now shows **four NFTs** — one from Pass 1 (Arbitrum) and **three** from Pass 2 (BSC).
- ☐ Each NFT is clearly labelled with its chain.
- ☐ **Balance check:** USDT `balance_before - balance_after` ≈ total price from step 3 (e.g. ~$256.50). **RED FLAG #6** if not.
- ☐ Disconnect, sign in as Wallet A → **Referrals**. You see **both** Wallet B events — one Arbitrum single node, one BSC triple. Two separate commission entries.
- ☐ The commission for the BSC triple should be roughly 3× the commission for the Arbitrum single. **Expected: approximately $25.65** (10% of ~$256.50 post-discount). Anything between **$24 and $28** is acceptable.
- ☐ **If the BSC commission is off by 10^12 or is in a completely different order of magnitude, that is a decimals bug.** Red Flag #9.
- ☐ **Fail if:** 3 nodes did not appear on My Nodes, the BSC purchase shows as Arbitrum, chains are mislabelled, or the BSC commission is wildly off from 3× the Arbitrum one.

---

**One adversarial check — self-referral on purchase:**

1. Sign in as Wallet A. Go to the Sale page.
2. In the referral code input at the top of the buy box, type Wallet A's own `OPR-XXXXXX` code.
3. See what the field does — the discount should not apply and a toast should say "You cannot use your own referral code."
4. Try to go through with a purchase anyway.

- ☐ Expect: Wallet A's own code does **not** apply a discount. If the purchase goes through, Wallet A has **no commission credit on its own purchase** visible on the Referrals page.
- ☐ **Fail (Red Flag #4) if:** Wallet A ends up with commission on its own purchase.

---

### Test 4 — Recovery after closed browser

**Goal:** If the tester closes the browser in the middle of a purchase, the site does not end up in a fake "Successful" state.

**Setup:** Sign in as Wallet A on Arbitrum. Sale page.

**Steps:**

1. Start a purchase: pick quantity 1, click Approve → Confirm in MetaMask → wait for approval → click Purchase.
2. MetaMask opens asking you to confirm the purchase. **Do not click Confirm.** Instead, **close the entire browser window**.
3. Wait 10 seconds. Reopen the browser, go to `http://localhost:3001`, sign in as Wallet A.

**Checks:**

- ☐ Go to My Nodes. Either no new NFT (the purchase was never submitted) or the recovered pending state at the top of the Sale page.
- ☐ The Sale page should not be stuck on an eternal spinner.
- ☐ **Fail (Red Flag #1) if:** the site says "Successful" for a purchase that never happened.

---

### Test 5 — EPP onboarding and partner purchase

**Goal:** The Elite Partner onboarding wizard walks end-to-end and creates a partner. **After creation, a purchase using the partner's `OPRN-XXXX` code shows a 15% discount (not 10%) and produces a different commission amount from a community referrer.**

**Setup — you need an EPP invite code.** Two ways:

**Option A — use a pre-seeded invite (easiest).** Migration `002_seed_data.sql` inserted several `EPP-XXXX` invite codes into the database when you ran it in Part 3.7. Open your Supabase project → **Table Editor** → `epp_invites` table → find a row where `status = 'pending'` and copy its `invite_code` value. That is your fresh invite.

**Option B — generate new invites via the admin API.** Open a **new terminal window** (leave `pnpm dev` running in the other) and run:
```
curl -X POST http://localhost:3001/api/admin/epp/invites \
  -H "Content-Type: application/json" \
  -H "Cookie: operon_session=<paste your admin session cookie>" \
  -d '{"count": 5}'
```
To get the `operon_session` cookie: sign in with your **Deployer** wallet on the site (remember it is the admin wallet), then in the browser press **F12** → **Application** tab → **Cookies** → `http://localhost:3001` → find `operon_session` and copy the value.

---

#### Happy-path wizard

1. Open a new Incognito window.
2. Go to `http://localhost:3001/epp/onboard?inv=<your EPP code>`.
3. **Step 1 — Welcome letter.** Read and click Next.
4. **Step 2 — Terms.** Scroll to the bottom (9 sections). Tick **I agree**. Click Next.
5. **Step 3 — Wallet and form.** Fill the form. Click Connect Wallet → pick a **fresh wallet that has never been used as a partner** (create a new "Wallet D" if needed). Sign the message.
6. **Step 4 — Confirmation.** A success screen with a new partner code starting with `OPRN-`.

**Checks:**

- ☐ Confirmation screen shows the new partner code (`OPRN-XXXX` format).
- ☐ The Referrals page (still signed in as the new partner) shows the partner card with an "Elite Partner" badge and the partner code.
- ☐ **Fail if:** wizard crashes, partner code missing, or confirmation screen blank.

**Write down the new `OPRN-XXXX` code — the next step needs it.**

---

#### Partner discount and commission test

Now we verify the partner's code gives a **15%** discount (not 10%) and produces a partner-tier commission.

1. Disconnect the new partner. Open a new Incognito window.
2. Go to `http://localhost:3001/?ref=<the OPRN-XXXX code you just got>`.
3. Sign in with a wallet that has never been used before — you can use the Deployer wallet (it has USDC and USDT on both chains from Part 3.5), or create a Wallet E in MetaMask and top it up.
4. Go to the Sale page on Arbitrum.

**Checks:**

- ☐ **The discount shown is 15%**, not 10%. The crossed-out original price should show 15% off, and the badge or summary should read "15% off".
- ☐ The partner's `OPRN-XXXX` code appears in the referral code badge.
- ☐ **Fail if:** the discount is 10% (that is the community rate, not the partner rate), or no discount appears at all.

Now buy one node:

5. Quantity 1, USDC, Approve → confirm → Purchase → confirm. Wait for success.

**Checks after purchase:**

- ☐ Disconnect, sign in as the new EPP partner (Wallet D or whichever wallet you onboarded). Go to Referrals.
- ☐ The purchase appears under the partner's activity, with a commission credited.
- ☐ The commission amount should be visibly **different** from the commission Wallet A received for Wallet B's purchase in Test 3 Pass 1 — partners earn at a different rate than community referrers. If they are identical, the partner tier logic is not kicking in.
- ☐ **Fail if:** no commission, or the commission is exactly the same as the community referrer rate.

---

#### Break attempts

**a) Already-used invite.** Take the invite code you already walked through. Reload the same onboarding URL.
- ☐ Expect: "this invite has already been used" message.

**b) Invalid invite.** Go to `http://localhost:3001/epp/onboard?inv=EPP-NOPE`.
- ☐ Expect: "invalid invite" message.

**c) Expired invite.** Go to your Supabase project → Table Editor → `epp_invites` → find an unused row → edit `expires_at` to yesterday's date → save. Visit `http://localhost:3001/epp/onboard?inv=<that code>`.
- ☐ Expect: "expired" message.

**d) Skip terms.** Fresh invite. Step 2: do not tick the agree box. Try to click Next.
- ☐ Expect: cannot advance.

---

### Test 6 — Languages

**Goal:** Every language renders real text, not placeholder keys. No English leaking.

**Steps:** Use the language chip at the top of the page. Switch to each language in turn (**Traditional Chinese, Simplified Chinese, Korean, Vietnamese, Thai**) and visit these pages:

- Sale page (especially the buy box — cycle 2 fixed a whole batch of sale-page keys that were only in English in cycle 1)
- Referrals page
- EPP onboarding Welcome Letter
- EPP onboarding terms

**For each language and each page:**

- ☐ All visible text is in the expected language. No English words in buttons, menus, or headings.
- ☐ No raw code like `sale.buyButton`, `{{discount}}`, or `undefined`.
- ☐ Buttons and headings do not overflow their container (Thai and Korean are often longer than English — watch for clipped text).
- ☐ **Fail (Red Flag #7 or #8) if:** any of the above.

**Also:**

- ☐ Switch to Thai, reload the page — still Thai.

---

## Part 7 — If something doesn't work

A few known rough edges that look like bugs but aren't. Check here before filing a report — it'll save you and the operator both some time.

### 7.1 A referral code is stuck on "activating your code on-chain" for more than a minute

**What you're seeing.** You entered a code and got the red toast *"Activating your code on-chain — please try again in a few seconds."* That's normal for the first 5–30 seconds after a brand new code is generated. If it stays red longer than about a minute, something is throttling the background sync.

**Why it happens.** When a user signs up, their referral code is written into the Supabase database instantly, but it *also* has to be registered on the sale contract on-chain — because when someone later buys with that code, the contract itself checks `validCodes[code] == true` before applying the 10% discount. Registering the code means a real on-chain transaction, which the app fires through an RPC endpoint in the background.

If you left `ARBITRUM_RPC_URL` and `BSC_RPC_URL` blank in `.env.local` (§3.6), the app falls back to the free public RPC endpoints (`https://sepolia-rollup.arbitrum.io/rpc` and a public BSC testnet RPC). Those endpoints rate-limit aggressively — a 2-hour test session easily hits their per-IP ceiling, at which point every background call starts returning "429 Too Many Requests" and the sync can't make progress.

**How to confirm it's the RPC.** Look at your `pnpm dev:indexer` terminal. If you see repeated lines like:

```
[dev-indexer] arbitrum RPC https://... unreachable: too many requests
[dev-indexer] arbitrum: switched to https://arbitrum-sepolia.publicnode.com
```

you're being rate-limited.

**How to fix it.**
1. Get a free Alchemy API key: **alchemy.com** → New App → Arbitrum Sepolia → copy the HTTPS URL.
2. Get a free QuickNode (or Infura, or publicnode) endpoint for BSC Testnet.
3. Paste the URLs into `ARBITRUM_RPC_URL=` and `BSC_RPC_URL=` in `.env.local`.
4. Stop both terminal windows with Ctrl+C, then restart `pnpm dev` and (in the second window) `pnpm dev:indexer`.
5. Wait ~10 seconds — the red toast should flip to the green badge automatically without you refreshing.

Private endpoints don't rate-limit your volume, so this won't come back.

### 7.2 I bought a node and it never appeared on the My Nodes page

**Most common cause:** your `pnpm dev:indexer` terminal isn't running, or it crashed silently. Without it, on-chain events don't reach the dashboard.

**What to do.**
1. Check the second terminal window. If it's been closed or it's full of red errors, restart it: `pnpm dev:indexer`.
2. Wait about 30 seconds after restarting — the indexer does a catch-up sweep on startup.
3. Refresh the My Nodes page.
4. If the NFT is visible on the block explorer (Arbiscan for Arbitrum Sepolia, BscScan for BSC Testnet) but *still* missing from the dashboard after 2 full minutes, **this is a genuine bug — please report it** using the Part 8 template.

### 7.3 `pnpm dev:indexer` crashes immediately with "DEV_INDEXER_SECRET is not set"

You're missing `DEV_INDEXER_SECRET=` in `.env.local` (§3.6). Generate one:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into the `DEV_INDEXER_SECRET=` line and restart `pnpm dev:indexer`. This secret is separate from `JWT_SECRET` — generate a fresh 32-byte random for each.

### 7.4 The sale page says "Please complete sign-in first" even though I already signed in

Your session cookie has gone stale — usually happens after a database reset, a long idle period, or if you restarted the dev server. Click **Disconnect** in the top-right of the page, then reconnect your wallet. MetaMask will ask you to sign the SIWE message again; after that, purchases work normally.

### 7.5 I see the spinner "Transaction is taking longer than expected" but nothing moved

That banner appears after 60 seconds in the Approving or Confirming state. It now links to the block explorer so you can check the transaction directly, instead of resetting the page. Two outcomes:

- **The explorer shows the transaction confirmed.** The indexer will pick it up within 30 seconds of re-appearing on-chain and the success screen will show without you needing to refresh. Give it a minute.
- **The explorer shows the transaction is still pending** (or doesn't know about it). Open MetaMask — you may have dropped the Confirm popup without realising. Confirm there; the page will catch up.

If the explorer shows the transaction reverted, that's a genuine bug and warrants a report.

---

## Part 8 — How to report a problem

For each issue, send the operator:

1. **Which test and step.** Example: "Test 3 Pass 2 step 5 — approval amount on BSC."
2. **Which chain** — Arbitrum Sepolia or BSC Testnet.
3. **What you did** — click by click.
4. **What you expected.**
5. **What actually happened** — exact error if there was one.
6. **Screenshot or short screen recording** if the problem is visual.
7. **How bad:**
   - **Blocker** — anything that matches a Red Flag in Part 5.
   - **Serious** — broken but no money at risk.
   - **Minor** — cosmetic or typo.
8. **Reproducible?** — "every time," "sometimes," or "once."
9. **The output of your `pnpm dev:indexer` terminal** — if the bug is "nothing showed up", check that window for errors or 401s first. If it's full of errors, the indexer may have lost its HMAC secret (check `.env.local`).

If it matches a Red Flag, put **RED FLAG #X** at the top of your message.

Also helpful: wallet address, transaction hash, approximate time, browser, OS.

---

## Part 9 — Known stuff — do not report

These are items we're aware of that are not fixed in this package. You will see them. Please don't spend time filing reports for any of them.

- The **Resources** page has placeholder links. That is fine.
- The **Thai terms** have not had final legal review. The text is there for functional testing only.
- The **Referrals page tier table** shows a fixed reference table, not a personalised row. That is deliberate.
- The app has **no admin UI** — admin actions happen through API endpoints only. That is also deliberate for Phase 1.

---

## Part 10 — Deferred for mainnet, not testnet bugs

**New in cycle 2.** These items came out of a ship-readiness review and will be addressed before mainnet, but do not affect the cycle 2 testnet walkthrough. If you notice any of them, please do not file a report.

1. **`OperonNode.setTransferLockExpiry` is not called at deploy time.** On this testnet deploy, NFTs are freely transferable from minute zero. The product rule (12-month transfer lock) will be enforced via a runbook step against the mainnet contracts before the real sale opens. The tester is not asked to transfer nodes, so this does not affect Tests 1–6.
2. **The `/api/sale/validate-code` endpoint leaks code existence** (code enumeration surface). Not a money-loss path, commercial-info concern only. Being addressed before mainnet.

If you see a bug not on the Known or Deferred list, **please report it.** Everything else on the site is in scope.
