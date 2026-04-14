-- Tracks per-chain sync state for referral codes registered on-chain via
-- NodeSale.addReferralCode(). Populated by /api/auth/wallet when a user's
-- personal code is created, and drained by /api/cron/reconcile which calls
-- the on-chain registration with retries.

create table if not exists referral_code_chain_state (
  code text not null,
  chain text not null check (chain in ('arbitrum', 'bsc')),
  status text not null check (status in ('pending', 'synced', 'failed')) default 'pending',
  discount_bps integer not null check (discount_bps >= 0 and discount_bps <= 10000),
  tx_hash text,
  last_error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (code, chain)
);

create index if not exists referral_code_chain_state_pending_idx
  on referral_code_chain_state (status, updated_at)
  where status <> 'synced';
