-- ═══════════════════════════════════════════════════════════════
-- 024: Carry the code owner's wallet through the on-chain sync queue.
--
-- Pattern A on-chain self-referral block (NodeSale.sol):
-- `addReferralCode(bytes32 codeHash, address owner, uint16 discountBps)` now
-- requires the owner address at registration so `purchase()` can reject
-- same-wallet self-referral on-chain. The dashboard's existing sync queue
-- (`referral_code_chain_state`) only carried code+chain+discount; this
-- migration adds `owner_wallet` so the cron drain can pass the right owner
-- when calling the contract.
--
-- New rows are NOT NULL — every code enqueued post-migration must specify
-- an owner. Pre-existing rows (if any) get the zero address as a backstop
-- so they don't block the schema change; on-chain that path falls through
-- to legacy-passthrough behaviour (no self-referral check), which matches
-- how those codes were already going to register before this change.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE referral_code_chain_state
  ADD COLUMN IF NOT EXISTS owner_wallet TEXT;

UPDATE referral_code_chain_state
SET owner_wallet = '0x0000000000000000000000000000000000000000'
WHERE owner_wallet IS NULL;

ALTER TABLE referral_code_chain_state
  ALTER COLUMN owner_wallet SET NOT NULL,
  ADD CONSTRAINT referral_code_chain_state_owner_wallet_format
    CHECK (owner_wallet ~ '^0x[a-f0-9]{40}$');
