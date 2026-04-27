import { ethers } from 'ethers';
import { CHAIN_IDS, TOKEN_DECIMALS as WAGMI_TOKEN_DECIMALS } from '@/lib/wagmi/contracts';

/**
 * NodeSale v2 voucher signer.
 *
 * Backend signs an EIP-712 PurchaseVoucher; the contract verifies the
 * signature against `voucherSigner` (set at deploy time / rotated via
 * setVoucherSigner from the owner Safe). Every field in the voucher is part
 * of the digest, so a tampered voucher recovers a different signer and the
 * contract reverts.
 *
 * Domain MUST match `EIP712("OperonNodeSale", "2")` from NodeSale.sol.
 * Types MUST match the PurchaseVoucher struct in NodeSale.sol — adding,
 * removing, or reordering fields here without the matching contract update
 * silently breaks every checkout (digests diverge, all signatures revert).
 */

export type SaleChain = 'arbitrum' | 'bsc';

export interface PurchaseVoucher {
  buyer: string;
  chainId: bigint;
  saleContract: string;
  tierId: bigint;
  quantity: bigint;
  token: string;
  unitPrice: bigint;
  discountBps: number;
  codeHash: string;
  reservationId: string;
  deadline: bigint;
}

const VOUCHER_TYPES: Record<string, ethers.TypedDataField[]> = {
  PurchaseVoucher: [
    { name: 'buyer', type: 'address' },
    { name: 'chainId', type: 'uint256' },
    { name: 'saleContract', type: 'address' },
    { name: 'tierId', type: 'uint256' },
    { name: 'quantity', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'unitPrice', type: 'uint256' },
    { name: 'discountBps', type: 'uint16' },
    { name: 'codeHash', type: 'bytes32' },
    { name: 'reservationId', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

const ZERO_BYTES32 = '0x' + '0'.repeat(64);

/**
 * `lib/wagmi/contracts.ts` is the single source of truth for chain ID and
 * token decimals — this module re-exports thin wrappers so callers don't
 * need two imports, and so future changes only have to land in one place.
 */
export function chainNameToChainId(chain: SaleChain): number {
  return CHAIN_IDS[chain];
}

export function tokenDecimalsFor(chain: SaleChain, token: 'USDC' | 'USDT' = 'USDC'): number {
  return WAGMI_TOKEN_DECIMALS[chain][token];
}

/**
 * cents (10^-2 USD) → token base units. Arbitrum stables are 6 decimals,
 * BSC stables are 18 — same dollar amount, different scale.
 *
 *   $500.00 cents = 50000 → 500_000_000 (6 dec) or 500_000_000_000_000_000_000 (18 dec)
 */
export function centsToTokenBaseUnits(
  cents: number | bigint,
  chain: SaleChain,
  token: 'USDC' | 'USDT' = 'USDC',
): bigint {
  const decimals = WAGMI_TOKEN_DECIMALS[chain][token];
  const c = typeof cents === 'bigint' ? cents : BigInt(cents);
  return c * BigInt(10) ** BigInt(decimals - 2);
}

/**
 * UUID v4 (8-4-4-4-12 hex) → bytes32. Right-aligned so the lower 16 bytes
 * carry the 122-bit UUID payload and the upper 16 are zero. Collision
 * probability with this many entropy bits across the lifetime of the sale
 * is negligible.
 */
export function uuidToBytes32(uuid: string): string {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`uuidToBytes32: invalid UUID format: ${uuid}`);
  }
  return '0x' + hex.padStart(64, '0');
}

/**
 * Reverse of uuidToBytes32 — used by webhook / reconcile when reading the
 * reservationId topic off a NodePurchased event to look up the sale_reservations row.
 */
export function bytes32ToUuid(value: string): string {
  const cleaned = value.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(cleaned)) {
    throw new Error(`bytes32ToUuid: invalid bytes32: ${value}`);
  }
  const hex = cleaned.slice(32); // drop the zero-padded high 16 bytes
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * keccak256 of the uppercase code string. Emitted in NodePurchased so
 * indexers / reconcile can correlate on-chain events back to the
 * code_used column. Returns ZERO_BYTES32 when no code is present so
 * the voucher type stays bytes32 (no Optional in EIP-712).
 */
export function codeToHash(code: string | null | undefined): string {
  if (!code) return ZERO_BYTES32;
  return ethers.id(code.toUpperCase());
}

function getSignerWallet(): ethers.Wallet {
  const key = process.env.VOUCHER_SIGNER_PRIVATE_KEY;
  if (!key) {
    throw new Error('VOUCHER_SIGNER_PRIVATE_KEY is not set');
  }
  return new ethers.Wallet(key);
}

/**
 * Fail-closed sanity check: the address derived from VOUCHER_SIGNER_PRIVATE_KEY
 * must match VOUCHER_SIGNER_ADDRESS. If they diverge (rotation half-applied,
 * env mis-paste), every voucher we sign would revert on-chain — better to
 * throw at sign time so the API returns a clear error than to ship a broken
 * checkout to users.
 */
function assertSignerConsistency(wallet: ethers.Wallet): void {
  const expected = process.env.VOUCHER_SIGNER_ADDRESS;
  if (!expected) {
    throw new Error('VOUCHER_SIGNER_ADDRESS is not set');
  }
  if (wallet.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      'voucher signer mismatch: VOUCHER_SIGNER_PRIVATE_KEY derives a different ' +
      'address than VOUCHER_SIGNER_ADDRESS. The contract will reject every ' +
      'voucher signed in this state. Verify both env vars before retrying.'
    );
  }
}

/**
 * Sign a PurchaseVoucher. Returns `{ voucher, signature }` ready to ship to
 * the client; the client passes both into `purchaseWithVoucher` on-chain.
 *
 * The caller is responsible for populating all voucher fields correctly
 * (chain → chainId, saleContract address, token decimals → unitPrice). This
 * function only owns: (a) loading the signer key, (b) verifying it derives
 * to VOUCHER_SIGNER_ADDRESS, (c) producing the EIP-712 signature.
 */
export async function signPurchaseVoucher(
  voucher: PurchaseVoucher
): Promise<{ voucher: PurchaseVoucher; signature: string }> {
  const wallet = getSignerWallet();
  assertSignerConsistency(wallet);

  const domain = {
    name: 'OperonNodeSale',
    version: '2',
    chainId: voucher.chainId,
    verifyingContract: voucher.saleContract,
  };

  const signature = await wallet.signTypedData(domain, VOUCHER_TYPES, voucher);
  return { voucher, signature };
}

/**
 * Internal helper for tests / debugging: recover the signer address from a
 * voucher + signature. Production callers don't need this — the contract
 * does the recovery on-chain.
 */
export function recoverVoucherSigner(
  voucher: PurchaseVoucher,
  signature: string
): string {
  const domain = {
    name: 'OperonNodeSale',
    version: '2',
    chainId: voucher.chainId,
    verifyingContract: voucher.saleContract,
  };
  return ethers.verifyTypedData(domain, VOUCHER_TYPES, voucher, signature);
}
