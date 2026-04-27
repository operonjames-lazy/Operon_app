import { expect } from "chai";

/**
 * Convergence test — contract emit ↔ DB ingest.
 *
 * Mig 030's amount math diverged from the contract by +1 cent on 38 of 40
 * tiers under any non-zero discount, because the SQL operates in cents
 * (10^-2 USD) while the contract operates in token base units (6-dec USDC,
 * 18-dec USDT) and the round-trip cents-floor doesn't agree algebraically
 * with mig 030's `gross - floor(gross * bps / 10000)` form. Mig 028's
 * `floor(gross * (10000 - bps) / 10000)` form does agree, because the
 * (10000 - bps) factor lets the cents-domain floor commute with the
 * token-domain floor for the values we operate on.
 *
 * This test is the load-bearing oracle for that claim. It enumerates every
 * (tier × discount × qty × decimals) tuple, computes:
 *   1. Contract math, in token base units (mirror of NodeSale.sol L207-L210)
 *   2. tokenAmountToCents floor — what the webhook receives
 *   3. SQL form A — what the DB asserts equality against (mig 031)
 * and asserts (2) === (3) byte-for-byte. If they ever diverge, an amount
 * mismatch class regression is in the SQL function and webhook ingest will
 * silently abandon every affected purchase.
 *
 * IMPORTANT: derive the SQL-expected value FROM the contract output, not
 * from a separate formula. A naive `expected = sqlForm(tier, qty, bps)`
 * tests SQL against itself; a future SQL regression that flips back to
 * the mig-030 form would still pass. We only test by taking the contract
 * emit and floor-converting it — the only number the webhook actually
 * sees in production.
 */

const ARB_DECIMALS = 6;   // USDC + USDT on Arbitrum
const BSC_DECIMALS = 18;  // USDC + USDT on BSC

// 40-tier price curve in cents — the actual `sale_tiers.price_usd` values
// seeded by mig 014 + applied to live Supabase. 5 % compound from $500 with
// integer-cent rounding at each step. Source of truth: live DB
// (`SELECT tier, price_usd FROM sale_tiers ORDER BY tier` snapshot
// 2026-04-27). If mig 014 changes, update both ends in the same commit.
const TIER_PRICES_CENTS: number[] = [
  50000,  52500,  55125,  57881,  60775,  63814,  67005,  70355,
  73873,  77566,  81445,  85517,  89793,  94282,  98997,  103946,
  109144, 114601, 120331, 126348, 132665, 139298, 146263, 153576,
  161255, 169318, 177784, 186673, 196006, 205807, 216097, 226902,
  238247, 250159, 262667, 275801, 289591, 304070, 319274, 335238,
];

// Domain values aligned with the post-discount voucher cap (1500 bps = 15%)
const DISCOUNT_BPS_CASES = [0, 1000, 1500];
const QUANTITY_CASES = [1, 2, 5, 10, 25, 50, 100];

/**
 * Production tokenAmountToCents — copied verbatim from
 * lib/webhooks/process-event.ts so the test exercises identical math
 * without a cross-package import.
 */
function tokenAmountToCents(rawAmount: bigint, decimals: number): number {
  if (decimals < 2) throw new Error(`Unsupported token decimals: ${decimals}`);
  const divisor = BigInt(10) ** BigInt(decimals - 2);
  const cents = rawAmount / divisor;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Token amount exceeds safe integer range: ${cents.toString()}`);
  }
  return Number(cents);
}

/**
 * Contract math — mirrors NodeSale.sol `purchaseWithVoucher`:
 *   uint256 totalPrice = unitPrice * quantity;
 *   if (discountBps > 0) totalPrice = totalPrice - (totalPrice * discountBps / 10000);
 *
 * unitPrice is delivered as `centsToTokenBaseUnits(unitPriceCents, chain, token)
 * = unitPriceCents * 10^(decimals - 2)`. We replicate that scaling here.
 */
function contractTotalPaid(
  unitPriceCents: number,
  quantity: number,
  discountBps: number,
  decimals: number,
): bigint {
  const scale = BigInt(10) ** BigInt(decimals - 2);
  const unitPriceTokens = BigInt(unitPriceCents) * scale;
  let total = unitPriceTokens * BigInt(quantity);
  if (discountBps > 0) {
    total = total - (total * BigInt(discountBps)) / BigInt(10000);
  }
  return total;
}

/**
 * SQL form A (mig 028 / mig 031): the formula stored on
 * sale_reservations.expected_amount_cents at reserve time.
 */
function sqlExpectedCents(
  unitPriceCents: number,
  quantity: number,
  discountBps: number,
): number {
  // BigInt math to avoid Number precision loss on large tiers × qty × bps.
  const numerator = BigInt(unitPriceCents) * BigInt(quantity) * BigInt(10000 - discountBps);
  return Number(numerator / BigInt(10000));
}

describe("Amount-math convergence — contract ↔ webhook ↔ DB ingest", () => {
  it("contract emit (round-tripped through tokenAmountToCents) === SQL form A on every tier × bps × qty × decimals", () => {
    const failures: string[] = [];
    for (let tierIdx = 0; tierIdx < TIER_PRICES_CENTS.length; tierIdx++) {
      const unitPriceCents = TIER_PRICES_CENTS[tierIdx];
      for (const decimals of [ARB_DECIMALS, BSC_DECIMALS]) {
        for (const bps of DISCOUNT_BPS_CASES) {
          for (const qty of QUANTITY_CASES) {
            const contractTokens = contractTotalPaid(unitPriceCents, qty, bps, decimals);
            const cents = tokenAmountToCents(contractTokens, decimals);
            const expected = sqlExpectedCents(unitPriceCents, qty, bps);
            if (cents !== expected) {
              failures.push(
                `tier ${tierIdx + 1} (${unitPriceCents}c) × qty ${qty} × ${bps}bps × ${decimals}-dec: ` +
                `contract→cents=${cents}, sql=${expected}, drift=${cents - expected}`,
              );
            }
          }
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Amount-math convergence failed on ${failures.length} cases:\n` +
        failures.slice(0, 20).join("\n") +
        (failures.length > 20 ? `\n  ... and ${failures.length - 20} more` : ""),
      );
    }
    expect(failures).to.have.lengthOf(0);
  });

  it("regression: mig-030 form would fail on the canonical tier-3/4/5 EPP cases", () => {
    // This is the inverse of the test above. mig 030's formula is
    //   gross - floor(gross * bps / 10000)   in CENTS.
    // We assert it disagrees with the contract round-trip on the cases that
    // the post-mig-30 review flagged. If a future contributor reintroduces
    // the bug, this test will pass (drift exists), and the previous test
    // will fail — the pair makes the failure mode unambiguous.
    function mig030Form(unitPriceCents: number, quantity: number, discountBps: number): number {
      const gross = BigInt(unitPriceCents) * BigInt(quantity);
      return Number(gross - (gross * BigInt(discountBps)) / BigInt(10000));
    }

    // Tier 3 = 60776 cents in mig 014's curve, but the prior review used
    // tier 3 = 55125 from an older curve revision; assert against the
    // currently-seeded tiers to keep the test in step with the data.
    const drifts: Array<{ tier: number; cents: number; mig030: number }> = [];
    for (let tierIdx = 0; tierIdx < TIER_PRICES_CENTS.length; tierIdx++) {
      const unitPriceCents = TIER_PRICES_CENTS[tierIdx];
      for (const decimals of [ARB_DECIMALS, BSC_DECIMALS]) {
        const contractTokens = contractTotalPaid(unitPriceCents, 1, 1500, decimals);
        const cents = tokenAmountToCents(contractTokens, decimals);
        const m030 = mig030Form(unitPriceCents, 1, 1500);
        if (cents !== m030) drifts.push({ tier: tierIdx + 1, cents, mig030: m030 });
      }
    }
    // If the curve doesn't include any drift-prone tier the test loses its
    // teeth — fail loud rather than pretend the regression is closed.
    expect(drifts.length, "mig-030 form must drift on at least one tier; test corpus may be too clean").to.be.greaterThan(0);
  });
});
