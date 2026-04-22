# Operon Dashboard — Hardening Gap Specifications

*10 items identified in audit. Specs below.*

---

## Gap 1: Immutable Contracts

### Decision: Immutable + Pausable

No proxy. No upgrade path. Immutable contracts with a `pause()` function for emergencies. If a critical bug is found: pause, deploy a new contract, migrate.

Every successful node sale (Aethir, Sophon, XAI) shipped immutable contracts. UUPS proxy adds attack surface — the upgrade function itself is a vulnerability. Auditors spend significant time on upgrade paths. Removing it makes the contract simpler, the audit cheaper, and the attack surface smaller.

### Contract Base

```solidity
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OperonNode is ERC721, Ownable2Step, Pausable, ReentrancyGuard {
    constructor(string memory name, string memory symbol) 
        ERC721(name, symbol) Ownable(msg.sender) {}
    // No initializer, no proxy, no upgrade function
}

contract NodeSale is Ownable2Step, Pausable, ReentrancyGuard {
    constructor(address nodeNft, address treasury) Ownable(msg.sender) {
        // Direct construction, no proxy
    }
}
```

### Emergency Procedure

```
1. Pause current contract (multi-sig call to pause())
2. Deploy new fixed contract
3. If NFT migration needed: snapshot holders, airdrop to new contract
4. Update frontend to point to new contract address
```

### CLAUDE.md Rule

```
Rule 9: Deploy immutable contracts — no proxy. Multi-sig (3-of-5) for 
admin functions (pause, withdraw, tier management).
```

## Gap 2: Front-Running Protection

### Problem

When Tier 2 has 1 node remaining, a pending purchase transaction is visible in the mempool. A bot could front-run it, buy the last node, and the original buyer's transaction reverts. On Arbitrum this is less severe (sequencer ordering is FCFS, not MEV-auction), but BSC has active front-running.

### Solution: Private Transaction Submission (Arbitrum)

Arbitrum's sequencer processes transactions in FIFO order — no MEV extraction. Standard submission is sufficient. No Flashbots needed.

If we add BSC support later (post-Phase 1 decision), use:
- **BSC: bloXroute or 48 Club** private transaction relays
- Or simply accept the risk — front-running a $446 node purchase is not economically attractive enough for most bots

### Additional Protection: Deadline Parameter

```solidity
function purchase(
    uint256 tier, 
    uint256 quantity, 
    address token, 
    bytes32 codeHash,
    uint256 deadline  // ← new: reverts if block.timestamp > deadline
) external nonReentrant whenNotPaused {
    require(block.timestamp <= deadline, "Transaction expired");
    // ... rest of purchase logic
}
```

Frontend sets deadline to `now + 5 minutes`. If a transaction sits in the mempool too long (congestion, low gas), it expires instead of executing at an unexpected tier.

### Additional Protection: Minimum Tier Check

```solidity
function purchase(
    uint256 tier,
    uint256 quantity,
    address token,
    bytes32 codeHash,
    uint256 deadline,
    uint256 maxPricePerNode  // ← new: reverts if price exceeds expectation
) external nonReentrant whenNotPaused {
    require(block.timestamp <= deadline, "Transaction expired");
    require(tiers[tier].price <= maxPricePerNode, "Price exceeds maximum");
    // ...
}
```

If the tier auto-advances between the user clicking "Buy" and the transaction confirming, the transaction reverts instead of silently charging a higher price. Frontend shows: "Tier changed while your transaction was pending. Please review the new price."

---

## Gap 3: Exact Approval Amount

### Rule

The frontend must NEVER request unlimited token approval. Always approve the exact purchase amount.

### Implementation

```typescript
// hooks/usePurchase.ts

const approveAmount = useMemo(() => {
  // Calculate exact amount: price × quantity, in token decimals (6 for USDC/USDT)
  return BigInt(pricePerNode) * BigInt(quantity); // Already in 6-decimal format
}, [pricePerNode, quantity]);

const { writeContract: approve } = useWriteContract();

const handleApprove = () => {
  approve({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [saleContractAddress, approveAmount], // Exact amount, not MaxUint256
  });
};
```

### Check Existing Allowance

Before showing the Approve button, check if sufficient allowance already exists:

```typescript
const { data: allowance } = useReadContract({
  address: tokenAddress,
  abi: erc20Abi,
  functionName: 'allowance',
  args: [userAddress, saleContractAddress],
});

const needsApproval = !allowance || allowance < approveAmount;
```

If allowance is sufficient (user already approved from a previous purchase attempt), skip the approve step entirely and go straight to purchase.

### CLAUDE.md Addition

```
Rule 12: Never request unlimited token approval (MaxUint256). Always approve 
the exact purchase amount. Check existing allowance before showing the 
Approve button — skip if sufficient.
```

---

## Gap 4: Webhook Signature Verification

### Problem

The event indexer endpoints (`/api/webhooks/alchemy`, `/api/webhooks/quicknode`) receive POST requests with purchase event data. Without signature verification, anyone can send fake events and create phantom purchases with phantom commissions.

### Alchemy Webhook Verification

```typescript
// app/api/webhooks/alchemy/route.ts
import { createHmac } from 'crypto';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('x-alchemy-signature');
  
  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 401 });
  }
  
  // Verify HMAC-SHA256 signature
  const expectedSignature = createHmac('sha256', process.env.ALCHEMY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  
  if (sigBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    console.error('[WEBHOOK] Invalid Alchemy signature');
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  // Signature valid — process the event
  const payload = JSON.parse(body);
  await processWebhookEvent(payload);
  
  return Response.json({ ok: true });
}
```

### QuickNode Webhook Verification

```typescript
// app/api/webhooks/quicknode/route.ts
export async function POST(req: Request) {
  const body = await req.text();
  const token = req.headers.get('x-qn-webhook-token');
  
  if (token !== process.env.QUICKNODE_WEBHOOK_SECRET) {
    console.error('[WEBHOOK] Invalid QuickNode token');
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }
  
  const payload = JSON.parse(body);
  await processWebhookEvent(payload);
  
  return Response.json({ ok: true });
}
```

### Additional: Verify Event On-Chain

Even with signature verification, always verify the event data against the actual chain state before recording:

```typescript
async function processWebhookEvent(payload: WebhookPayload) {
  const txHash = payload.event.transactionHash;
  
  // Re-fetch the transaction receipt from the chain
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    console.error(`[WEBHOOK] TX ${txHash} not confirmed or failed`);
    return;
  }
  
  // Parse the actual event logs from the receipt
  const purchaseEvents = receipt.logs
    .filter(log => log.address === saleContractAddress)
    .map(log => saleInterface.parseLog(log))
    .filter(parsed => parsed?.name === 'NodePurchased');
  
  if (purchaseEvents.length === 0) {
    console.error(`[WEBHOOK] No NodePurchased event in TX ${txHash}`);
    return;
  }
  
  // Use the on-chain data, not the webhook payload
  for (const event of purchaseEvents) {
    await recordPurchase({
      txHash,
      buyer: event.args.buyer,
      tier: event.args.tier,
      quantity: event.args.quantity,
      // ... from on-chain, not from webhook
    });
  }
}
```

---

## Gap 5: XSS Sanitization on URL Params

### Problem

Referral codes come from URL params: `app.operon.network?ref=OPRN-K7VM`. If someone crafts a malicious URL with `?ref=<script>alert(1)</script>` or `?ref="><img onerror=...>`, and that value is rendered unsafely, it's XSS.

### Solution

React JSX auto-escapes by default — `{referralCode}` in JSX is safe. The risks are:

1. **Constructing URLs with the code** — `new URL(\`...?ref=${code}\`)` could break if code contains special chars
2. **Clipboard write** — `navigator.clipboard.writeText(code)` could write malicious content
3. **Document title or meta tags** — `document.title = \`Operon - ${code}\`` is injectable

### Implementation

```typescript
// lib/sanitize.ts

// Referral code format: OPRN-[4 alphanumeric chars]
const REFERRAL_CODE_REGEX = /^OPRN-[A-HJ-NP-Z2-9]{4}$/;

export function sanitizeReferralCode(input: string | null): string | null {
  if (!input) return null;
  
  // Strip whitespace
  const trimmed = input.trim().toUpperCase();
  
  // Validate against exact format
  if (!REFERRAL_CODE_REGEX.test(trimmed)) {
    return null; // Invalid — don't use it
  }
  
  return trimmed;
}

// Usage in page component:
const searchParams = useSearchParams();
const rawCode = searchParams.get('ref');
const referralCode = sanitizeReferralCode(rawCode); 
// Either a valid OPRN-XXXX code or null — never arbitrary user input
```

### Rule

Any value from URL params, query strings, or user input must be validated against its expected format BEFORE being used in any context (display, URL construction, clipboard, API call). The referral code has a strict regex — anything that doesn't match is discarded.

---

## Gap 6: Database Backup Strategy

### Supabase Pro Plan Backups

Supabase Pro includes:
- **Point-in-time recovery (PITR)** — restore to any second within 7 days
- **Daily automated backups** — retained for 7 days
- **Manual backups** — on-demand via dashboard

### Configuration

```
Backup frequency: Continuous (WAL archiving for PITR)
Retention: 7 days (Supabase Pro default)
Recovery test: Monthly — restore to a test project and verify data integrity
Critical tables: purchases, referral_purchases, commission_payouts, epp_partners
```

### Additional: Export Critical Data

Weekly cron job exports critical tables to S3 as CSV (belt-and-suspenders):

```typescript
// api/cron/backup-export/route.ts — runs weekly via Vercel Cron
export async function GET() {
  const tables = ['purchases', 'referral_purchases', 'commission_payouts', 'epp_partners'];
  
  for (const table of tables) {
    const { data } = await supabase.from(table).select('*');
    const csv = convertToCSV(data);
    await uploadToS3(`backups/${table}/${new Date().toISOString()}.csv`, csv);
  }
  
  return Response.json({ ok: true });
}
```

### Disaster Recovery Runbook

```
Scenario: Supabase database corrupted or data loss
1. Identify the last known good timestamp
2. Use PITR to restore to that timestamp (Supabase dashboard)
3. Verify: run reconciliation job to fill any gaps between restore point and now
4. Verify: compare on-chain purchase count against DB purchase count
5. If PITR unavailable: restore from weekly S3 export + run reconciliation
```

---

## Gap 7: RPC Failover

### Solution: wagmi fallback + try/catch

No custom circuit breaker. wagmi has built-in `fallback()` transport that tries providers in order.

### Frontend

```typescript
// lib/wagmi.ts
import { http, fallback } from 'viem';

const arbitrumTransport = fallback([
  http(process.env.NEXT_PUBLIC_ALCHEMY_ARB_URL),
  http(process.env.NEXT_PUBLIC_QUICKNODE_ARB_URL),
  http(), // Public RPC
]);

const bscTransport = fallback([
  http(process.env.NEXT_PUBLIC_QUICKNODE_BSC_URL),
  http(), // Public RPC
]);
```

### Backend

```typescript
// lib/rpc.ts
async function callRpc<T>(chain: string, fn: (url: string) => Promise<T>): Promise<T> {
  const urls = chain === 'arbitrum' 
    ? [process.env.ALCHEMY_ARB_URL, process.env.QUICKNODE_ARB_URL]
    : [process.env.QUICKNODE_BSC_URL, 'https://bsc-dataseed.binance.org'];
  
  for (const url of urls) {
    try { return await fn(url!); }
    catch { continue; }
  }
  throw new Error(`All RPCs failed for ${chain}`);
}
```

## Gap 8: Commission Audit Trail

### Problem

If a partner disputes their commission ("I should have earned $53.52 on that sale but I only see $42.82"), we need to replay the exact calculation to show what happened.

### Solution: Store Calculation Inputs

```sql
-- Updated referral_purchases table
referral_purchases (
  id UUID PRIMARY KEY,
  referral_id UUID REFERENCES referrals(id),
  purchase_tx VARCHAR(66) NOT NULL,
  chain VARCHAR(10) NOT NULL,
  
  -- Purchase data (inputs)
  buyer_wallet VARCHAR(42) NOT NULL,
  tier INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  gross_amount_usd INTEGER NOT NULL,    -- before discount, in cents
  discount_bps INTEGER NOT NULL,         -- 1500 = 15%
  net_amount_usd INTEGER NOT NULL,       -- after discount, in cents
  
  -- Attribution data (inputs)
  referrer_id UUID NOT NULL,
  level INTEGER NOT NULL,                -- 1 = direct, 2 = second, etc.
  referrer_tier VARCHAR(20) NOT NULL,    -- partner tier AT TIME OF PURCHASE
  commission_rate INTEGER NOT NULL,      -- in bps (1200 = 12%)
  credited_weight INTEGER NOT NULL,      -- in bps (10000 = 100%)
  
  -- Calculated outputs
  commission_usd INTEGER NOT NULL,       -- in cents
  credited_amount INTEGER NOT NULL,      -- in cents
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  block_number BIGINT,
  log_index INTEGER,
  
  UNIQUE(purchase_tx, level)
)
```

### Replay Function

```typescript
// For dispute resolution: recalculate commission from stored inputs
function verifyCommission(record: ReferralPurchase): { 
  expected: number; 
  actual: number; 
  match: boolean 
} {
  const expectedCommission = Math.floor(
    (record.net_amount_usd * record.commission_rate) / 10000
  );
  
  const expectedCredited = Math.floor(
    (record.net_amount_usd * record.credited_weight) / 10000
  );
  
  return {
    expected: expectedCommission,
    actual: record.commission_usd,
    match: expectedCommission === record.commission_usd,
  };
}
```

### Admin Debugger Query

```sql
-- "Show me exactly how David's $160.56 commission was calculated"
SELECT 
  rp.purchase_tx,
  rp.tier,
  rp.quantity,
  rp.net_amount_usd / 100.0 AS sale_amount,
  rp.level,
  rp.referrer_tier AS tier_at_time,
  rp.commission_rate / 100.0 || '%' AS rate,
  rp.commission_usd / 100.0 AS commission,
  rp.credited_weight / 100.0 || '%' AS credit_weight,
  rp.credited_amount / 100.0 AS credited,
  rp.created_at
FROM referral_purchases rp
WHERE rp.referrer_id = :partner_user_id
ORDER BY rp.created_at DESC;
```

---

## Gap 9: Graceful Degradation

### Solution: TanStack Query Configuration

No custom sessionStorage cache. TanStack Query already serves stale data while refetching, retries failed requests, and deduplicates concurrent calls.

### Configuration

```typescript
// providers.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // Data considered fresh for 30s
      gcTime: 5 * 60_000,      // Keep unused data for 5 min
      retry: 3,                // Retry failed requests 3 times
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: true,
    },
  },
});
```

### Behaviour

When the API is down, TanStack Query automatically:
- Serves the last successful response (stale but visible)
- Retries 3 times with exponential backoff
- Shows loading/error states via `isLoading`, `isError`, `isStale` flags

Components check `isStale` and show a subtle banner:

```tsx
{query.isStale && (
  <div className="text-xs text-amber text-center py-1">
    Data may be delayed
  </div>
)}
```

No custom cache layer needed.

## Gap 10: End-to-End Referral Chain Integration Test

### Test Scenario

Simulate a realistic referral chain with 50 purchases across 5 levels and verify every commission, credited amount, and tier promotion.

```typescript
// packages/contracts/test/integration/referral-chain.test.ts

describe('Full Referral Chain Integration', () => {
  let sale: NodeSale;
  let node: OperonNode;
  let usdc: MockERC20;
  
  // Partners: A → B → C → D → E (A referred B, B referred C, etc.)
  let partnerA, partnerB, partnerC, partnerD, partnerE: SignerWithAddress;
  // Buyers: 10 buyers per partner
  let buyers: SignerWithAddress[];

  beforeEach(async () => {
    // Deploy contracts, mint USDC to all buyers, register referral codes
  });

  it('should correctly attribute 50 purchases across 5 cascade levels', async () => {
    // Partner A's direct buyers purchase 10 nodes each
    for (const buyer of buyersA) {
      await usdc.connect(buyer).approve(sale.address, TIER_2_PRICE);
      await sale.connect(buyer).purchase(2, 1, usdc.address, codeHashA, deadline, maxPrice);
    }
    
    // Partner B's buyers (L2 for A)
    for (const buyer of buyersB) {
      await usdc.connect(buyer).approve(sale.address, TIER_2_PRICE);
      await sale.connect(buyer).purchase(2, 1, usdc.address, codeHashB, deadline, maxPrice);
    }
    
    // ... C, D, E
    
    // Verify Partner A's commissions
    // L1: 10 × $446 × 12% = $535.20
    // L2: 10 × $446 × 7% = $312.20
    // L3: 10 × $446 × 4.5% = $200.70
    // L4: 10 × $446 × 3% = $133.80
    // Total: $1,181.90
    
    // Verify Partner A's credited amount
    // L1: 10 × $446 × 100% = $4,460
    // L2: 10 × $446 × 25% = $1,115
    // L3: 10 × $446 × 15% = $669
    // L4: 10 × $446 × 10% = $446
    // Total: $6,690 → should have auto-promoted from Affiliate to Partner
    
    const partnerATier = await getPartnerTier(partnerA.address);
    expect(partnerATier).to.equal('partner'); // Auto-promoted at $5,000
  });

  it('should handle concurrent purchases in the same block', async () => {
    // Submit 5 purchases simultaneously (same block on Hardhat)
    await Promise.all(
      buyers.slice(0, 5).map(buyer =>
        sale.connect(buyer).purchase(2, 1, usdc.address, codeHashA, deadline, maxPrice)
      )
    );
    
    // Verify no double-counting, no missing attributions
  });

  it('should handle tier boundary correctly', async () => {
    // Buy 1,249 of 1,250 Tier 2 nodes, then buy 2 more
    // First should succeed at Tier 2, second should auto-advance to Tier 3
    // or revert with maxPricePerNode check
  });

  it('should prevent self-referral', async () => {
    await expect(
      sale.connect(partnerA).purchase(2, 1, usdc.address, codeHashA, deadline, maxPrice)
    ).to.be.revertedWith('Self-referral not allowed');
  });

  it('should respect per-wallet limits', async () => {
    // Buy max allowed, then try one more
    for (let i = 0; i < WALLET_LIMIT; i++) {
      await sale.connect(buyers[0]).purchase(2, 1, usdc.address, codeHashA, deadline, maxPrice);
    }
    await expect(
      sale.connect(buyers[0]).purchase(2, 1, usdc.address, codeHashA, deadline, maxPrice)
    ).to.be.revertedWith('Wallet limit reached');
  });
});
```

### Backend Integration Test

```typescript
// supabase/functions/tests/referral-attribution.test.ts

describe('Referral Attribution Service', () => {
  it('should walk a 5-level chain and calculate all commissions correctly', async () => {
    // Setup: create a 5-level referral chain in the DB
    // Simulate a purchase event
    // Verify: 5 referral_purchase records created
    // Verify: each has correct commission_rate, commission_usd, credited_amount
    // Verify: partner A's credited_amount updated (sum of all weighted amounts)
    // Verify: if credited crossed $5K, partner A auto-promoted to Partner tier
  });

  it('should be idempotent — processing the same event twice creates no duplicates', async () => {
    await processPurchaseEvent(testEvent);
    await processPurchaseEvent(testEvent); // Second call
    
    const records = await db.from('referral_purchases')
      .select('*')
      .eq('purchase_tx', testEvent.txHash);
    
    // Should have exactly the same number of records as levels in the chain
    expect(records.length).to.equal(expectedLevels);
  });
});
```
