# TESTING_GUIDE.md — Operon Phase 1 (cycle 3)

**Who this is for:** Anyone helping us test the Operon app before real money goes live. You need a computer, a browser, and about half a day total (roughly 2 hours of setup, then 1–2 hours of clicking through tests).

**What you're doing:** Installing the Operon app on your own laptop, setting up crypto wallets on two practice blockchains (Arbitrum Sepolia and BSC Testnet), then testing the crucial money paths: reserving a slot, buying a node, using a referral link, seeing the discount, and checking that commissions land on the correct wallets — including across multi-level referral chains and across an automatic tier price step. Everything else is already covered by automated tests. You are only testing things that need a human with eyes and a wallet.

**Why this matters:** When this goes live, people will be paying real money on two different blockchains. A silent failure on launch day — wrong commission, premature "Successful" message, missing discount, or a tier-boundary purchase that gets locked in at the wrong price — is close to impossible to fix after the fact. Your job is to break this stuff now.

**What's different from cycle 2 (this is a major shape change — read this section even if you tested cycle 2):**

* **Direct `purchase()` is gone.** The old "Approve → Buy" flow has been replaced by a two-step **voucher checkout**. You now click **Reserve** first, which holds inventory + signs a 12-minute server-issued voucher; you then approve the token + call **Buy** within the countdown window. If the countdown hits 00:00 before you finish, the reservation auto-expires and you start over. **No funds at risk** — the contract rejects expired vouchers.
* **The "activating your code on-chain" delay is GONE.** Migration 027 dropped the on-chain referral-code mirror; codes are now applied off-chain via the voucher signature. The red toast / 5-30s wait you saw in cycle 2 no longer happens. If you see it on cycle 3 the build is stale.
* **Two new asks for cycle 3** that did not have explicit coverage before: **multi-level referral chains** (Test 7, 3-level commission walk) and **tier promotion at the boundary** (Test 8, watching tier 1 fill and tier 2 activate mid-session). Test 8 needs a one-line SQL setup the operator runs before handing the package over — see §3.7.1.
* **Admin pause now actually halts new reservations.** Cycle 2's pause only paused the contract; the backend kept handing out vouchers. Cycle 3 flips `sale_config.stage='paused'` first, so the Reserve button disables on every connected client within seconds. Test 9 covers this.
* **New env vars in §3.6** — `VOUCHER_SIGNER_ADDRESS`, `VOUCHER_SIGNER_PRIVATE_KEY`, `LOCAL_TIER_CAP`, `ADMIN_CAP_PER_TIER`. Two of these are *generated on your machine* (the signer keypair). Don't reuse anyone else's.
* **New migrations to apply** (§3.7) — `019` through `034`, in order. Cycle 2 stopped at `018`. The list is long but the apply step is the same as before; budget ~3 minutes.

A known-caveats list is in Part 10 at the bottom of this guide — those are items that have been intentionally deferred for later, not bugs we want you to report. Part 7 covers the common "looks like a bug but isn't" situations you'll hit — **read Part 7 before you file a report.**

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

You need **five wallets** in MetaMask:

- **Deployer** — deploys the smart contracts. Also your admin wallet.
- **Wallet A** — top of the referral chain.
- **Wallet B** — referred by Wallet A.
- **Wallet C** — referred by Wallet B (Test 7's 3-level chain) and the competing wallet in Test 8's adversarial.
- **Wallet D** — fresh wallet that gets onboarded as an EPP partner in Test 5.

### 2.1 Create five MetaMask accounts

MetaMask icon → account circle (top-right) → **Add a new account** → name it **Deployer**. Repeat for **Wallet A**, **Wallet B**, **Wallet C**, **Wallet D**.

(Cycle 2 only needed three. Cycle 3 adds C for the 3-level referral chain (A → B → C in Test 7) plus the competing wallet in Test 8's adversarial, and D for the EPP partner onboarding (Test 5).)

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

### 2.4 Fund all five wallets on both chains

Each wallet needs a small amount of the native coin on each chain to pay network fees.

**Arbitrum Sepolia faucet:** `https://www.alchemy.com/faucets/arbitrum-sepolia` (or ask the operator for a backup). Switch MetaMask to Arbitrum Sepolia, copy each wallet address in turn, request funds from the faucet for all five.

**BSC Testnet faucet:** `https://testnet.bnbchain.org/faucet-smart`. Switch MetaMask to BSC Testnet. Request funds for all five wallets.

After this, all five accounts should show small ETH balances on Arbitrum and small tBNB balances on BSC.

> **Faucets rate-limit per IP per day** — if you can't fund all five in one go, do three now and two tomorrow, or split across two networks if your home and mobile data have different IPs.

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

**Cycle 3 prelude — generate a voucher-signer keypair first.** NodeSale v2 verifies an EIP-712 voucher on every purchase. The voucher is signed by a keypair that lives off-chain on the API server, not in any user's wallet. Generate one fresh on your machine before deploying:

```
node -e "const {Wallet} = require('ethers'); const w = Wallet.createRandom(); console.log('VOUCHER_SIGNER_ADDRESS=' + w.address); console.log('VOUCHER_SIGNER_PRIVATE_KEY=' + w.privateKey)"
```

Save both printed values — `VOUCHER_SIGNER_ADDRESS` is used by the deploy script below; `VOUCHER_SIGNER_PRIVATE_KEY` goes into `.env.local` (§3.6). **Do not reuse a key from anyone else** (including the operator's testnet key); the keypair binds every voucher this dashboard signs.

From the `contracts` folder:

```
cd contracts
export DEPLOYER_PRIVATE_KEY=<paste the 0x... key from Part 2.5>
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
export VOUCHER_SIGNER_ADDRESS=<paste from the keypair you just generated>
export TREASURY_ADDRESS=<the Deployer wallet address>
export LOCAL_TIER_CAP=1250
export ADMIN_CAP_PER_TIER=1250
```

**Deploy a mock USDC token:**
```
npx hardhat run scripts/deploy-mock-usdc.ts --network arbitrumSepolia
```
Save the printed address as `USDC_ARB`.

**Deploy the main contracts (NodeSale v2):**
```
export USDC_ADDRESS=<USDC_ARB>
export TOKEN_DECIMALS=6
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```
The deploy script will print:
- `OperonNode deployed to: 0x…` → save as `NODE_ARB`
- `NodeSale (v2) deployed to: 0x…` → save as `SALE_ARB`

The script also seeds all 40 tier prices + caps in the same run. Confirm the tail of the output ends with `Tier 39: minPrice=$3352.38…` — if it stops earlier than tier 39, the seed loop reverted and you must re-run the deploy.

> **Note on testnet vs mainnet:** the deploy script falls back to sensible defaults on Arbitrum Sepolia / BSC Testnet (treasury → deployer, tier caps → 1250). On mainnet (`--network arbitrum` / `bsc`) the same script fails closed if any required env var is missing — see §7 of `LIVENET_TEST_RUNBOOK.md`. You don't need to do anything for the testnet pass.

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
Paste these, replacing the addresses. One command per line — repeat the `mint` line for each of the five wallets (Deployer, A, B, C, D):
```
const usdc = await ethers.getContractAt("MockERC20", "<USDC_ARB>")
await usdc.mint("<Deployer address>", "10000000000")
await usdc.mint("<Wallet A address>", "10000000000")
await usdc.mint("<Wallet B address>", "10000000000")
await usdc.mint("<Wallet C address>", "10000000000")
await usdc.mint("<Wallet D address>", "10000000000")
```
That gives each wallet 10,000 practice USDC (6 decimals). Type `.exit`.

Now BSC — **note the extra zeros because BSC uses 18 decimals**:
```
npx hardhat console --network bscTestnet
const usdt = await ethers.getContractAt("MockERC20", "<USDT_BSC>")
await usdt.mint("<Deployer address>", "10000000000000000000000")
await usdt.mint("<Wallet A address>", "10000000000000000000000")
await usdt.mint("<Wallet B address>", "10000000000000000000000")
await usdt.mint("<Wallet C address>", "10000000000000000000000")
await usdt.mint("<Wallet D address>", "10000000000000000000000")
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

# ── NEW in cycle 3 — voucher signer ────────────────────────────
# These two values are the keypair you generated at the top of §3.3.
# VOUCHER_SIGNER_ADDRESS must equal what the contract was deployed
# with; if they diverge the contract will reject every voucher
# (lib/voucher.ts asserts this on every signing call).
# VOUCHER_SIGNER_PRIVATE_KEY is server-only — never NEXT_PUBLIC_*.
VOUCHER_SIGNER_ADDRESS=<from the keypair printout>
VOUCHER_SIGNER_PRIVATE_KEY=<from the keypair printout>

# ── NEW in cycle 3 — per-tier caps ────────────────────────────
# Mirror what you exported during the contract deploy. Both default
# to 1250 (matching deploy.ts defaults). Test 8 (tier promotion)
# does NOT use these — it uses the small-supply override the
# operator runs in §3.7.1.
LOCAL_TIER_CAP=1250
ADMIN_CAP_PER_TIER=1250

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
3. In your file manager, open the folder `operon-dashboard/supabase/migrations`. You will see files named `001_initial_schema.sql`, `003_functions.sql`, etc. Note: `002_seed_data.sql` is **no longer in this folder** — it lives in `supabase/testnet-only/` and is applied separately in step 3.7.1 (see below).
4. Open `001_initial_schema.sql` in a text editor. Select all. Copy. Paste into the Supabase SQL Editor. Click **Run**.
5. Wait for **Success**.
6. Clear the editor. Repeat for each remaining file **in numerical order**:
   `003, 004, 005, 006, 008, 009, 010, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 025, 026, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036`. **Skip 002 (testnet-only, applied in 3.7.1), 007 (does not exist), and 024 (deleted before apply, see DECISIONS D32).**

That is **32 mainnet migrations** for a fresh setup. 035 + 036 are the R8 ship-readiness fixes (referrals summary RPC + orphan-purge of `complete_reservation`). Cycle 2 stopped at 018, so testers returning from cycle 2 only need to apply 019 onward — but it is safer to nuke the Supabase DB and re-run the full list against a clean schema.

If any file errors, stop and message the operator.

Notes (most relevant cycle 3 ones, in apply order):
- `002_seed_data.sql` (in `supabase/testnet-only/`, applied in 3.7.1) pre-seeds a handful of EPP invite codes. It also inserts demo rows (a fake "David Kim" EPP partner, two historical purchases) purely for dashboard screenshots — they are testnet-only because they leave `sale_tiers` showing tier 1 sold-out / tier 2 partially sold, which is wrong for a fresh mainnet sale. Do NOT apply this on mainnet.
- `013_referral_chain_state.sql` was needed in cycle 2 for the on-chain code mirror. **Cycle 3 drops the table again in mig 027** — apply it then drop it. The "activating your code on-chain" delay is gone.
- `014` + `017` together seed the 40-tier price curve safely (the guard in `017` skips the destructive reset if `purchases` rows already exist).
- `019` adds the `admin_killswitches` table the admin panel uses.
- `020` + `022` + `023` move admin aggregates from JS reduces into Postgres RPCs (no observable behaviour change for the tester).
- `021` filters suspended EPP partners out of new commission walks (Test 7 exercises this).
- `025` replaces the cron lock with a row-based TTL lease (no observable change).
- `026` + `028` are the **NodeSale v2 voucher checkout DB layer** — `sale_reservations` table + `reserve_node_purchase` / `process_purchase_with_reservation` / `expire_old_reservations` RPCs. This is what makes the new Reserve flow work.
- `027` drops `referral_code_chain_state` (and therefore the cycle-2 "activating your code on-chain" delay). If you see that toast on cycle 3, you forgot to apply 027.
- `029` Postgres aggregation for `/api/admin/health` failed-events stats.
- `030` REVOKEs broad anon access to the `public` schema and re-grants narrow column SELECT on `sale_tiers` + `sale_config` only. **Mandatory** — without this, the anon key can read customer / partner / commission rows directly.
- `031` is the post-mig-30 hotfix: introduces `sale_reservations.expected_amount_cents` (the canonical post-discount amount), reverts a +1c rounding regression, disables RLS on `sale_config` so Realtime delivers updates to anon, adds `admin_money_invariants()` for cross-table drift detection.
- `032` adds `cron_alert_sentinel` so the cron's per-tick Telegram alerts don't spam.
- `033` fixes the I3 invariant predicate + `jsonb_agg` ordering for stable drift signatures.
- `034` is the **pause-coverage RPC gate**: `reserve_node_purchase` reads `sale_config.stage` and rejects when not `'active'`. Required for Test 9.

### 3.7.1 Apply the testnet-only files (seed data + supply override + commission audit view)

After the 30 mainnet migrations land, apply two files from `supabase/testnet-only/` **in this order**:

1. `supabase/testnet-only/002_seed_data.sql` — demo "David Kim" EPP partner row + pre-seeded EPP invite codes for Test 5. Apply this AFTER 014 has run on an empty `purchases` table.
2. `supabase/testnet-only/035_small_supply_override.sql` — small tier-1 supply (7) and the `commission_audit` view.

These files live outside `supabase/migrations/` on purpose so the production runner never picks them up. **Do not apply either of them on mainnet** — they exist purely to make Test 5 / Test 8 reachable on a small testnet supply budget.

What 035 does:

1. **Tier 1 supply = 7**, tiers 2+3 = 100 each. The slot budget across cycle 3 is calibrated so Tests 3 + 5 + 7 consume exactly 6 of tier 1's 7 slots, leaving the last slot for Test 8. That makes Test 8 a single reserve+approve+buy at the tier boundary — the moment the last slot fills, tier 2 auto-activates.
2. **A `commission_audit` view** that joins purchases + referral_purchases + users and converts cents → dollars. Lets you spot-check commission accuracy with a single `SELECT * FROM commission_audit;` after any buy. See §6.0 below for how to read the output.

Open each file in a text editor → select all → paste into the Supabase SQL Editor → Run.

Expected after both: `sale_tiers` shows tier 1 with `total_supply=7, total_sold=0, is_active=true`; tiers 2+3 with `total_supply=100, total_sold=0, is_active=false`. The `epp_partners` table has the demo "David Kim" row (`credited_amount=0`, no demo purchases back it), and `epp_invites` has a couple of `status='pending'` invites you can grab for Test 5. `purchases` is empty, `referral_purchases` is empty, so `admin_money_invariants()` reports `ok: true` from t=0. If `total_sold > 0` on any tier, message the operator — something else is off.

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
- [ ] MetaMask has **five** accounts: Deployer, Wallet A, Wallet B, Wallet C, Wallet D
- [ ] MetaMask has Arbitrum Sepolia and BSC Testnet networks added
- [ ] All five wallets have some ETH on Arbitrum and some tBNB on BSC
- [ ] All five wallets show ~10,000 USDC on Arbitrum and ~10,000 USDT on BSC
- [ ] You have the six contract addresses written down somewhere
- [ ] **All mainnet migrations were run through 034** (30 files, listed in §3.7 — 002 skipped because it's testnet-only).
- [ ] **Applied BOTH testnet-only files** per §3.7.1: `supabase/testnet-only/002_seed_data.sql` (demo EPP partner + pre-seeded invites) AND `supabase/testnet-only/035_small_supply_override.sql` (small tier-1 supply + `commission_audit` view). Skipping 035 makes Test 8 take hours instead of minutes.
- [ ] `.env.local` has all of: `DEV_ENDPOINTS_ENABLED=1`, `DEV_INDEXER_SECRET=<hex>`, `VOUCHER_SIGNER_ADDRESS`, `VOUCHER_SIGNER_PRIVATE_KEY`, `LOCAL_TIER_CAP`, `ADMIN_CAP_PER_TIER`
- [ ] `VOUCHER_SIGNER_ADDRESS` matches what the contract was deployed with — if they diverge, every Reserve fails with `voucher signer mismatch`.

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

**Nine tests in cycle 3** (six from cycle 2 + three new). Run them in order — earlier tests set up state for later ones. Each test has a **Goal**, **Steps**, and **Pass/Fail checks** marked with ☐.

The tests only cover things a human with a browser and a wallet can verify. Contract logic, backend math, rate limiting, authorization, and signature verification are already covered by automated tests — do not bother manually testing those.

**Useful tip — the Sale page has a Chain Selector.** To switch between Arbitrum and BSC while testing, use the **in-app Chain Selector** on the Sale page, not MetaMask's network dropdown. If your wallet is on the wrong network, the site will show a "Switch to X" button — click it and approve in MetaMask. This is the smoother flow.

---

### §6.0 How to verify commissions are accurate (use this throughout)

The §3.7.1 testnet override created a `commission_audit` view in your Supabase. After any buy, run:

```sql
SELECT * FROM commission_audit LIMIT 20;
```

You'll see one row per `referral_purchases` entry, joined with the underlying `purchases` row. Columns:

| Column | What it means |
|---|---|
| `tx_hash` / `chain` | The on-chain transaction |
| `purchase_tier` | Which tier the node was bought from |
| `quantity` / `discount_bps` | How many nodes, what discount applied |
| `amount_dollars` | Total paid post-discount, in USD (cents → dollars) |
| `buyer_wallet` | Who bought |
| `level` | 1 = direct referrer, 2 = grandparent, etc. |
| `referrer_tier` | `community` for a regular user, or an EPP tier (`affiliate` / `partner` / `senior` / `regional` / `market` / `founding`) |
| `rate_bps` | Stored commission rate in basis points (1000 = 10%, 300 = 3%) |
| `upline_wallet` | Who got paid |
| `commission_dollars` | The actual commission, in USD |
| `derived_bps` | Sanity column: `commission_usd / amount_usd × 10000`. Should match `rate_bps` within ±1 bp of rounding. If it doesn't, that's a money-math bug — report it. |

**Expected community rates (from `lib/commission.ts COMMUNITY_COMMISSION_RATES`):**

| Level | Rate | What ~$450 net buy pays at this level |
|---:|---:|---:|
| L1 | 1000 bps (10%) | ~$45.00 |
| L2 |  300 bps (3%)  | ~$13.50 |
| L3 |  200 bps (2%)  | ~$9.00 |
| L4 |  100 bps (1%)  | ~$4.50 |
| L5 |  100 bps (1%)  | ~$4.50 |

**EPP rates differ** — the simplest sanity check is `rate_bps = 1200` for L1 from any partner-tier upline (12% vs the community 10%). Test 5 exercises this directly.

When a test asks you to "verify commissions are correct," run `SELECT * FROM commission_audit;` and check the matching row. If `rate_bps` and `derived_bps` differ by more than 1 bp, the on-chain amount and the recorded commission are out of sync — flag it.

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

**Cycle 3 note — the cycle 2 "activating your code on-chain" delay is GONE.** Migration 027 dropped the on-chain code mirror; codes are now applied off-chain via the voucher signature. If you see the red "activating on-chain" toast on cycle 3, your DB is missing migration 027 — stop and message the operator.

**Now try one thing to break it — self-referral:**

1. Sign out Wallet B (use the Disconnect button, not just MetaMask). New Incognito window.
2. Go to `http://localhost:3001/?ref=<Wallet A's own code>`.
3. Sign in with **Wallet A** — the wallet that owns that code.
4. Go to the Sale page.

- ☐ Expect: no discount (the 10% should DISAPPEAR the moment you finish signing — cycle 2 re-runs the self-ref check post-sign-in).
- ☐ **Fail if:** a 10% discount is still applied after you sign in, or Wallet A ends up as its own referrer on the Referrals page.

---

### Test 3 — Reserve, buy a node, receive referral credit (run twice)

**Goal:** The core money path — **reserve**, approve, purchase, get the NFT, referrer gets their commission. Run once on Arbitrum with USDC (quantity 1), then once on BSC with USDT (quantity 3). These are the two places real money will move at launch. The decimals difference between the chains and the quantity multiplication are the two most common sources of silent bugs.

**New flow shape vs cycle 2.** The Sale page now has a **Reserve** button instead of going straight to Approve+Buy. Click Reserve, the backend signs a 12-minute voucher and shows a countdown. Approve the token, then click Buy. The contract verifies the voucher signature on-chain. **All three numbers — price, discount, total — are locked at Reserve time and shown on the countdown banner.** If the countdown hits 00:00 the voucher dies and the contract refuses to accept it; click Reserve again and you get a fresh one (possibly at a new tier price if a tier promotion happened in between).

---

#### Pass 1 — Arbitrum Sepolia + USDC + quantity 1

**Setup:** Sign in as Wallet B (referred by Wallet A from Test 2). Go to the Sale page. Use the **in-app Chain Selector** to pick **Arbitrum**. If MetaMask is on a different network, click the "Switch to Arbitrum" button and approve in MetaMask.

Confirm the referrer and 10% discount are still shown.

**Before clicking anything, write down Wallet B's current USDC balance** — you can see it on the payment-token button next to "USDC — $10,000.00" or similar. Call this `balance_before`.

**Steps:**

1. Pick **quantity: 1**.
2. Pick **USDC** as the token.
3. **Write down the total price shown on the Sale page.** Example: `$450.00` for tier 1 with 10% off.
4. **Click Reserve.** A countdown banner appears showing `12:00` (or close to it) and the locked total price. The reservation row is now in the database; the voucher is signed and ready.
   - ☐ **Fail if:** no countdown appears, or the locked price differs from what you wrote down in step 3.
5. **Click Approve.** MetaMask shows the approval popup.
6. **Look carefully at the MetaMask approval popup.** Near the top, MetaMask shows a human-readable amount like `450 USDC`. It should roughly match the price from step 3.
   - ☐ **STOP AND REPORT** (Red Flag #2) if: it says **Unlimited**, warns about "unlimited access," or shows an amount clearly larger than the price.
7. Click **Confirm** in MetaMask. Wait for the approve transaction to confirm.
8. **Click Buy on the website.** MetaMask pops up calling `purchaseWithVoucher(...)`.
9. Confirm in MetaMask.
10. **Watch the website while MetaMask is still processing.** The site should show a spinner or "Confirming" state. Only **after** MetaMask shows the transaction as confirmed should it flip to the Purchase Complete modal.
    - ☐ **STOP AND REPORT** (Red Flag #1) if: the website says "Successful" before MetaMask confirms.

**Pass or fail checks:**

- ☐ Go to **My Nodes**. One NFT is listed, owned by Wallet B, on Arbitrum.
- ☐ Go back to the Sale page and check the USDC balance shown on the payment-token button — call this `balance_after`. **`balance_before - balance_after` should roughly equal the price** you wrote down in step 3. A few cents of rounding is fine. **RED FLAG #6** if the balance barely dropped, or dropped by many times the price.
- ☐ The countdown banner is gone (the reservation is now `completed`).
- ☐ Go to **Referrals** (still as Wallet B). The purchase appears in your activity.
- ☐ Disconnect, sign in with **Wallet A**. Go to **Referrals**.
- ☐ Wallet B's purchase appears in your activity feed.
- ☐ A commission amount is shown on Wallet A. **Expected: approximately $45** (L1 community rate is 10%, applied to the post-discount price of ~$450). A few cents of rounding is fine. Anything between **$40 and $50** is acceptable; outside that range, note the actual number and report.
- ☐ **Now verify with `commission_audit`:** in Supabase SQL Editor, run `SELECT * FROM commission_audit LIMIT 5;`. The top row should show this purchase with `level=1`, `referrer_tier='community'`, `rate_bps=1000`, `derived_bps=1000.0`, `commission_dollars≈45.00`, `upline_wallet=<Wallet A address>`. If `rate_bps` and `derived_bps` differ by >1 bp, the on-chain amount and recorded commission are out of sync — flag it.
- ☐ **Fail if:** no NFT, no referral entry on Wallet A, commission is zero (the chain walk is broken), negative, or many times larger than the purchase price.

> **Adversarial check, optional:** click Reserve, then idle 13 minutes without clicking Approve. The countdown hits 00:00, banner clears. Click Reserve again — you should get a fresh voucher (possibly at the same price, possibly tier-promoted depending on timing). The expired reservation row transitions to `status='expired'` on the next cron tick (~5 min). **Fail if:** the contract accepts the expired voucher (it should revert "voucher expired") or the second Reserve call fails with `tier_quantity_exceeded` (the cron should have released the inventory).

---

#### Pass 2 — BSC Testnet + USDT + quantity 3

**Setup:** Still signed in as Wallet B. On the Sale page, use the **in-app Chain Selector** to switch to **BNB Chain**. If MetaMask is still on Arbitrum, the site will show a "Switch to BNB Chain" button — click it, approve the network switch in MetaMask.

Confirm the referrer and 10% discount are still shown after the chain change — this is a check that referral state survives chain switches.

Write down Wallet B's current **USDT** balance as `balance_before`.

**Steps (same Reserve → Approve → Buy shape as Pass 1):**

1. Pick **quantity: 3** (this test deliberately buys multiple to verify multiplication).
2. Pick **USDT** as the token.
3. **Write down the total price shown.** It should be roughly 3× the per-node price minus the 10% discount — at tier 1 ($500/node nominal, $450 after 10% off) that's ~`$1,350.00`. The Sale page also shows the per-node price underneath the quantity selector — sanity-check it.
4. **Click Reserve.** Countdown banner appears with the locked total.
5. **Click Approve.** MetaMask approval popup:
   - ☐ The **formatted** amount near the top should read roughly `1350 USDT` or similar — matching the locked total.
   - ☐ **Reminder:** because USDT on BSC uses 18 decimals, the raw number in the transaction data is long (e.g. `1350000000000000000000`). That is normal. Trust the formatted amount.
   - ☐ **STOP AND REPORT** (Red Flag #2) if it says **Unlimited** or the formatted amount is wildly wrong.
6. Confirm approve. Wait. **Click Buy.** Confirm. Watch for premature success.

**Pass or fail checks:**

- ☐ **My Nodes** now shows **four NFTs** — one from Pass 1 (Arbitrum) and **three** from Pass 2 (BSC).
- ☐ Each NFT is clearly labelled with its chain.
- ☐ **Balance check:** USDT `balance_before - balance_after` ≈ total price from step 3 (e.g. ~$1,350). **RED FLAG #6** if not.
- ☐ Disconnect, sign in as Wallet A → **Referrals**. You see **both** Wallet B events — one Arbitrum single node, one BSC triple. Two separate commission entries.
- ☐ The commission for the BSC triple should be roughly 3× the commission for the Arbitrum single. **Expected: approximately $135** (10% of ~$1,350 post-discount). Anything between **$120 and $150** is acceptable.
- ☐ **If the BSC commission is off by 10^12 or is in a completely different order of magnitude, that is a decimals bug.** Red Flag #9.
- ☐ **Fail if:** 3 nodes did not appear on My Nodes, the BSC purchase shows as Arbitrum, chains are mislabelled, or the BSC commission is wildly off from 3× the Arbitrum one.

---

**One adversarial check — self-referral on the buy box:**

1. Sign in as Wallet A. Go to the Sale page.
2. In the referral code input at the top of the buy box, type Wallet A's own `OPR-XXXXXX` code.
3. ☐ The discount should NOT apply and a toast should say "You cannot use your own referral code."
4. Click **Reserve** with the code still typed in. The locked total in the countdown banner should be the FULL price (no discount baked in) — the code was rejected, so Reserve proceeds without it.
5. **Don't click Approve.** Let the reservation expire (close the tab) so we don't burn one of tier 1's slots — the Test 8 budget needs them.

- ☐ Expect: the reservation comes back at the full tier price, no discount applied. The reserve route returns success because the code rejection only zeroes the discount; it doesn't block the buy.
- ☐ **Fail (Red Flag #4) if:** the discount is applied with Wallet A's own code (the field accepted self-ref), or the locked total shows a 10% community discount.

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

**Option A — use a pre-seeded invite (easiest).** `supabase/testnet-only/002_seed_data.sql` (applied in Part 3.7.1) inserted several `EPP-XXXX` invite codes into the database. Open your Supabase project → **Table Editor** → `epp_invites` table → find a row where `status = 'pending'` and copy its `invite_code` value. That is your fresh invite.

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
5. **Step 3 — Wallet and form.** Fill the form. Click Connect Wallet → pick **Wallet D** (the fresh wallet you set up in §2.1 specifically for this test). Sign the message.
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
3. Sign in with a wallet that has not been used in any prior test — the Deployer wallet works (it has USDC and USDT on both chains from Part 3.5).
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
- ☐ **Verify with `commission_audit`:** `SELECT * FROM commission_audit LIMIT 5;`. The top row should show `referrer_tier='affiliate'` (or whichever tier the partner is at — almost always `affiliate` immediately after onboarding) and `rate_bps=1200` (12%, vs the community 10%). `derived_bps` should match `rate_bps` within 1 bp.
- ☐ **Fail if:** no commission, or `rate_bps` is `1000` (that's the community rate — the partner-tier surface didn't fire).

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

### Test 7 — Multi-level referral chain (NEW in cycle 3)

**Goal:** Verify a 3-level commission walk. Wallet A refers Wallet B; Wallet B refers Wallet C. Wallet C buys a node — *all three uplines* should receive commission entries at descending rates (L1 highest, L3 lowest). The chain walk happens atomically inside a single Postgres RPC; we're verifying the application surfaces every level correctly and that the math doesn't lose precision deep in the chain.

**Setup:** Tests 1-2 should already have built A → B (Wallet B's referrer is Wallet A). We now add B → C.

**Step A: Wallet C signs up under Wallet B's code.**

1. New Incognito window.
2. Go to `http://localhost:3001/?ref=<Wallet B's OPR code from Test 1 sequel>`. (To get Wallet B's code: sign in as Wallet B, /referrals page; write it down.)
3. Sign in with **Wallet C**. Sign the SIWE message.
4. Go to /referrals — confirm Wallet C now has its own `OPR-XXX` code AND shows "Referred by Wallet B" (or the wallet B address).
5. **Fail if:** no "referred by" attribution, or attribution shows the wrong wallet.

**Step B: Wallet C buys 1 node on Arbitrum.**

1. Wallet C still signed in. Sale page → Arbitrum → quantity 1, USDC.
2. **Reserve → Approve → Buy** (full voucher flow).
3. Wait for Purchase Complete modal.

**Step C: Verify all three levels paid.**

1. /referrals as Wallet C → activity feed shows the purchase, no commission to self.
2. Disconnect, sign in as **Wallet B** → /referrals → activity feed shows Wallet C's purchase. **Commission should be ~$45** (L1 rate is 10% of post-discount ~$450).
3. Disconnect, sign in as **Wallet A** → /referrals → activity feed shows Wallet C's purchase (one upline level deeper). **Commission should be ~$13.50** (L2 rate is 3% of post-discount ~$450; see `lib/commission.ts COMMUNITY_COMMISSION_RATES = [1000, 300, 200, 100, 100]`).
   - L1 = 10% (1000 bps) → ~$45
   - L2 = 3%  (300 bps)  → ~$13.50
   - L3 = 2%  (200 bps)  → would apply if there's a wallet above A; in this 3-level chain A is L2 max.
4. **Verify with `commission_audit`** — this is the load-bearing chain-walk check, run it now:

   ```sql
   SELECT level, referrer_tier, rate_bps, upline_wallet, commission_dollars, derived_bps
     FROM commission_audit
    WHERE tx_hash = '<paste Wallet C's purchase tx_hash>'
    ORDER BY level;
   ```

   Expect exactly 2 rows:

   | level | referrer_tier | rate_bps | upline_wallet | commission_dollars | derived_bps |
   |---|---|---|---|---|---|
   | 1 | community | 1000 | <Wallet B> | ~45.00 | 1000.0 |
   | 2 | community |  300 | <Wallet A> | ~13.50 |  300.0 |

   - ☐ **Fail if:** only 1 row appears (chain walk stopped at L1), `rate_bps` doesn't tier down (1000 → 300), or `derived_bps` differs from `rate_bps` by more than 1 bp on either row.
5. **Fail if:** Wallet B's commission is missing (chain walk broke at L1), Wallet A's commission is missing (chain walk broke at L2), or either commission is identical to the L1 rate (the rate ladder isn't tiering down).

**Adversarial: cross-wallet self-ref.** Sign in as Wallet B, attempt to reserve while pasting Wallet B's OWN `OPR-XXX` code as a referral.

- ☐ Expect: the field rejects with "you cannot use your own referral code" toast and the Reserve call returns `{error: 'invalid_code', reason: 'self_referral'}` if you bypass the field check.
- ☐ **Fail if:** the system accepts the code and credits Wallet B's own purchase.

---

### Test 8 — Tier promotion at the boundary (NEW in cycle 3)

**Goal:** Witness tier 1 fill on its last buy, watch tier 2 auto-activate, and verify a reservation taken *before* the promotion still completes at the locked tier-1 price (because `expected_amount_cents` was stored on the reservation row at Reserve time, not recomputed at Buy time).

**Pre-flight: confirm tier 1 has exactly 1 slot left.** The §3.7.1 override set tier 1 supply = 7. Tests 3 (qty 1+3) + 5 (qty 1) + 7 (qty 1) consumed 6. Run this in Supabase SQL Editor:

```sql
SELECT tier, total_supply, total_sold, is_active, price_usd
  FROM sale_tiers WHERE tier IN (1, 2) ORDER BY tier;
```

Expected:
- Tier 1: `total_supply=7`, `total_sold=6`, `is_active=true`, `price_usd=50000` (=$500).
- Tier 2: `is_active=false`, `price_usd=52500` (=$525, 5% step).

**If `total_sold` ≠ 6**, Tests 3/5/7 went off-script — adjust your Step B quantity below to make `total_sold + Step B qty = 7`. (Or skip ahead to Step D and look at whatever the current state is — the price-lock invariant still holds.)

**Step A: Hold the tier-1 reservation OPEN.**

1. Sign in as **Wallet B**. Sale page → Arbitrum → quantity 1.
2. **Click Reserve.** Countdown banner appears showing tier 1 locked price (~$450 = $500 − 10% community discount). The reservation is now `status='reserved'` in the DB and the slot is held; `total_sold` did NOT yet increment because the buy hasn't completed.
3. **Do NOT click Approve yet.** Keep this tab open.

**Adversarial check during the hold.** From a NEW Incognito window signed in as Wallet C, go to the Sale page and try to **Reserve qty=2 on Arbitrum**.

- ☐ Expect: `tier_quantity_exceeded` — only 1 slot is available because Wallet B is holding it. Wallet C's reservation request rejects without signing a voucher. Per `lib/voucher.ts assertSignerConsistency`, no `voucher_signing_failed` either — the rejection happens earlier in the RPC.
- ☐ **Fail if:** Wallet C gets a voucher for 2 nodes anyway. That would mean the held-reservation isn't reserving inventory, which breaks the entire global-cap promise.

**Step B: Complete Wallet B's held reservation — this fills tier 1.**

1. Switch back to the Wallet B tab from Step A. Countdown should still be running.
2. **Click Approve → Buy.** Wait for Purchase Complete.
3. Re-run the pre-flight SQL:
   - ☐ Tier 1: `total_sold=7`, `is_active=false`.
   - ☐ Tier 2: `is_active=true`. **The auto-promotion fired.**
4. Run `SELECT * FROM commission_audit LIMIT 5;`. The most recent row is Wallet B's purchase. **Verify `purchase_tier=1` and `amount_dollars ≈ 450` even though tier 2 is now active.** The voucher locked the price at Reserve time.
5. **Fail if:** Wallet B's purchase landed at tier 2 price (~$472.50), or tier 2 didn't auto-activate, or `commission_audit` shows `purchase_tier=2`.

**Step C: Verify new reservations land in tier 2 at the new price.**

1. Wallet B Sale page → Arbitrum → quantity 1.
2. **Click Reserve.** The locked price should be **~$472.50** (5% above tier 1, post-discount: $525 × 0.9).
3. ☐ Sale page header / current-tier indicator shows **tier 2**.
4. ☐ **Fail if:** the new reservation comes back at tier 1 price (~$450).

(You don't need to actually buy this one — the test is about pricing. Cancel by letting it expire, or just close the tab.)

---

### Test 9 — Admin pause halts new reservations (NEW in cycle 3)

**Goal:** When the operator pauses the sale, the buyer's Reserve button should disable within seconds across every connected client, and any in-flight reservation attempt should reject cleanly (not hand out a doomed voucher). When the operator unpauses with `chain='both'`, the Reserve button comes back.

**Setup:** Need a fresh signed-in user (Wallet B is fine) on the Sale page. Also need a second terminal where the operator (you) can curl the admin endpoints. Get the admin session cookie the same way as Test 5: sign in with the **Deployer** wallet, F12 → Application → Cookies → copy `operon_session`.

**Step A: Pause via curl.**

```
curl -X POST http://localhost:3001/api/admin/sale/pause \
  -H "Content-Type: application/json" \
  -H "Cookie: operon_session=<paste>" \
  -d '{"chain":"both"}'
```

Response should be 200 with `ok: true` and per-chain `txHash` values. (On testnet the contract pause tx confirms in a few seconds.)

**Step B: Verify the buyer-side Reserve button disables.**

1. Switch to the Wallet B browser tab. Refresh the Sale page (or wait ~10s for Realtime to push the update).
2. ☐ The Reserve button is **disabled** with text like "Sale paused".
3. Try to click it — nothing should happen.
4. **Adversarial via curl:** try to bypass the UI and call the API directly:
   ```
   curl -X POST http://localhost:3001/api/sale/reserve \
     -H "Content-Type: application/json" \
     -H "Cookie: <Wallet B's operon_session>" \
     -d '{"chain":"arbitrum","quantity":1,"token":"USDC"}'
   ```
   ☐ Expect: 423 with `{"error":"sale_paused"}` (the API gate).

**Step C: Unpause and verify the button comes back.**

```
curl -X POST http://localhost:3001/api/admin/sale/unpause \
  -H "Content-Type: application/json" \
  -H "Cookie: operon_session=<paste>" \
  -d '{"chain":"both"}'
```

Response should include `stage_restored: true` (cycle 3 only restores the DB stage when chain='both' AND every contract unpause succeeded).

1. Refresh the Wallet B Sale page.
2. ☐ Reserve button is **enabled** again at the current tier price.

**Adversarial: single-chain unpause does NOT auto-resume.**

```
curl -X POST http://localhost:3001/api/admin/sale/pause \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin>" \
  -d '{"chain":"both"}'

curl -X POST http://localhost:3001/api/admin/sale/unpause \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin>" \
  -d '{"chain":"arbitrum"}'
```

Response should include `stage_restored: false`. Reserve button should STAY disabled. Operator must explicitly call unpause with `chain='both'` to fully resume.

- ☐ **Fail if:** Reserve becomes enabled after a single-chain unpause, or sale_config.stage flips to 'active' before both chains are confirmed clean.

---

## Part 7 — If something doesn't work

A few known rough edges that look like bugs but aren't. Check here before filing a report — it'll save you and the operator both some time.

### 7.1 The Reserve button doesn't appear / countdown never starts

**Most common cause:** `VOUCHER_SIGNER_PRIVATE_KEY` is missing from `.env.local`, or the address it derives doesn't match what the contract was deployed with. The Reserve API call returns `voucher_signing_failed` and the UI shows a generic "reservation failed" toast.

**How to fix.**
1. Confirm both `VOUCHER_SIGNER_ADDRESS` and `VOUCHER_SIGNER_PRIVATE_KEY` are set in `.env.local` (§3.6).
2. Confirm they're the *same keypair* you used at deploy time (§3.3 prelude). If the env address derives a different value than the contract was deployed with, every voucher signing call rejects.
3. Re-run `pnpm dev` after editing `.env.local` so Next picks up the change.

If a tester didn't generate their own keypair, this is the #1 thing that goes wrong.

### 7.2 Stale-rpc obsolete RPC rate-limit notes

**Cycle 2 had a long section here** about the on-chain code-mirror sync hitting rate limits during a long test session. **Cycle 3 removed that path** (mig 027 dropped `referral_code_chain_state`); referral codes now apply off-chain via the voucher signature. Public RPC endpoints can still rate-limit the dev-indexer's `eth_getLogs` poll loop — if you see 429s in the indexer terminal, set `ARBITRUM_RPC_URL` / `BSC_RPC_URL` to a private endpoint (Alchemy / QuickNode) and restart.

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
- The app has a **partial admin UI** — `/admin` panels exist for sale state, partners, killswitches, audits. A handful of admin actions still require curl (Test 9 pause/unpause, Test 5 invite generation). That is deliberate for Phase 1.
- **`pnpm test:e2e:chain` is currently a stub** — the full-chain Playwright fixture isn't wired (~3-4 hr separately scoped). The manual checklist in this guide is the substitute. You don't need to run it.
- **Single-chain admin unpause leaves stage='paused'** by design (Test 9 step 3 covers this). Operator must call unpause with `chain='both'` to fully resume.

---

## Part 10 — Deferred for mainnet, not testnet bugs

**Carried forward from cycle 2 + 3.** These items came out of ship-readiness reviews and will be addressed before mainnet, but do not affect the testnet walkthrough. If you notice any of them, please do not file a report.

1. **`OperonNode.setTransferLockExpiry` is not called at deploy time.** On this testnet deploy, NFTs are freely transferable from minute zero. The product rule (12-month transfer lock) will be enforced via a runbook step against the mainnet contracts before the real sale opens. The tester is not asked to transfer nodes, so this does not affect any test.
2. **The `/api/sale/validate-code` endpoint leaks code existence** (code enumeration surface). Not a money-loss path, commercial-info concern only. Being addressed before mainnet.
3. **Admin pause/unpause/withdraw routes will return `admin_not_owner` post-Safe-novation** on mainnet — this is by design (NodeSale ownership rotates to a Gnosis Safe). The mainnet operator path for those actions is the Safe UI directly. Testnet keeps the hot-key flow per Test 9.
4. **Some admin endpoints have small placeholder UIs.** `/admin/health` shows live failed-events stats + money invariants, but a few of the older admin views (e.g. `/admin/announcements`) still behave like dev scaffolding. Functional testing of admin actions in Tests 5 + 9 is enough — don't file UI-polish tickets on the admin panel.

If you see a bug not on the Known or Deferred list, **please report it.** Everything else on the site is in scope.
