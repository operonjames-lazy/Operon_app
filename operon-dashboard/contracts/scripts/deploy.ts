import { ethers, network } from "hardhat";

// Mainnet network names from hardhat.config.ts. Any of these triggers
// fail-closed env validation: missing TREASURY_ADDRESS, missing accepted
// tokens, or missing TOKEN_DECIMALS/LOCAL_TIER_CAP/ADMIN_CAP_PER_TIER all
// abort the deploy instead of silently using a fallback that would lock
// real funds into the wrong wallet or ship a sale that accepts no tokens.
const MAINNET_NETWORKS = new Set(["arbitrum", "arbitrumOne", "bsc"]);

function isMainnet(): boolean {
  return MAINNET_NETWORKS.has(network.name);
}

function requireEnv(key: string, why: string): string {
  const v = process.env[key];
  if (!v || v === "0x" + "0".repeat(40)) {
    throw new Error(
      `[deploy] ${key} is required on mainnet (${network.name}). ${why}\n` +
      `Set it explicitly before running deploy:\n` +
      `  export ${key}=<value>`,
    );
  }
  return v;
}

/**
 * NodeSale v2 deploy script.
 *
 * Constructor takes (treasury, voucherSigner). The voucher signer is the
 * address whose private key (held off-chain in VOUCHER_SIGNER_PRIVATE_KEY)
 * will sign every PurchaseVoucher. Owner is the deployer at deploy time —
 * production deploys then `transferOwnership` to a Safe and use the Safe
 * for all owner-only calls (setTreasury, setTierMinPrice, setLocalTierCap,
 * setAdminCap, setVoucherSigner, pause/unpause, withdraw, adminMint).
 *
 * Tier setup:
 *   The 40-tier curve is now driven by the backend (sale_tiers row + the
 *   reservation RPC). The contract only needs per-tier price floor, local
 *   per-chain cap, and admin cap. We seed all 40 tiers in one tx-loop so
 *   the contract is fully usable as soon as the deploy completes; the
 *   backend's "active tier" pointer determines which tier reservations
 *   land in.
 *
 * Required env:
 *   TREASURY_ADDRESS         — wallet that receives stablecoin payments
 *   VOUCHER_SIGNER_ADDRESS   — public address of the off-chain voucher signer
 *   USDC_ADDRESS             — accepted USDC (per chain)
 *   USDT_ADDRESS             — accepted USDT (per chain)
 *   TOKEN_DECIMALS           — 6 on Arbitrum, 18 on BSC
 *   LOCAL_TIER_CAP           — per-chain hard cap per tier (e.g., 1250)
 *   ADMIN_CAP_PER_TIER       — per-tier admin allocation (e.g., 1250)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Treasury fallback to the deployer is acceptable on local/testnet (the
  // deployer is the operator's hot wallet anyway) but a deploy footgun on
  // mainnet — sale proceeds would land in the dev wallet, not the cold
  // multisig that actually receives funds. Force explicit env on mainnet.
  let treasuryAddress: string;
  if (isMainnet()) {
    treasuryAddress = requireEnv(
      "TREASURY_ADDRESS",
      "This is the wallet that receives every USDC/USDT payment from buyers. " +
      "Falling back to the deployer would lock real proceeds in the dev key.",
    );
  } else {
    treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  }

  const voucherSignerAddress = process.env.VOUCHER_SIGNER_ADDRESS;
  if (!voucherSignerAddress) {
    throw new Error("VOUCHER_SIGNER_ADDRESS env var is required");
  }
  if (isMainnet()) {
    requireEnv(
      "VOUCHER_SIGNER_ADDRESS",
      "Mismatched signer at deploy time would brick every voucher signed " +
      "on the API server until rotated via setVoucherSigner.",
    );
  }

  // --- Deploy OperonNode ---
  const OperonNode = await ethers.getContractFactory("OperonNode");
  const operonNode = await OperonNode.deploy();
  await operonNode.waitForDeployment();
  const nodeAddress = await operonNode.getAddress();
  console.log("OperonNode deployed to:", nodeAddress);

  // --- Deploy NodeSale (v2) ---
  const NodeSale = await ethers.getContractFactory("NodeSale");
  const nodeSale = await NodeSale.deploy(treasuryAddress, voucherSignerAddress);
  await nodeSale.waitForDeployment();
  const saleAddress = await nodeSale.getAddress();
  console.log("NodeSale (v2) deployed to:", saleAddress);
  console.log("  treasury:", treasuryAddress);
  console.log("  voucherSigner:", voucherSignerAddress);

  // --- Wire OperonNode minter to the sale ---
  await (await operonNode.setMinter(saleAddress)).wait();
  console.log("Minter set to NodeSale:", saleAddress);

  // --- Wire NodeSale → node contract ---
  await (await nodeSale.setNodeContract(nodeAddress)).wait();
  console.log("NodeContract set on NodeSale:", nodeAddress);

  // --- Set accepted tokens (USDC / USDT) ---
  // Mainnet REQUIRES at least one stablecoin be accepted, otherwise the
  // sale contract would deploy in a state where every purchase reverts on
  // "token not accepted". Testnet allows skipping if the operator is
  // staging the deploy in pieces.
  let usdcAddress = process.env.USDC_ADDRESS;
  let usdtAddress = process.env.USDT_ADDRESS;
  if (isMainnet()) {
    // At least one of the two must be set; ideally both. We don't hard-
    // require both because some deployments may launch USDC-only and add
    // USDT after a separate due-diligence pass.
    if (!usdcAddress && !usdtAddress) {
      throw new Error(
        "[deploy] mainnet deploy requires at least one of USDC_ADDRESS or USDT_ADDRESS " +
        "to be set. Sale contract would otherwise deploy with no accepted tokens, " +
        "reverting every purchase. Set the canonical token addresses for the chain.",
      );
    }
    if (usdcAddress) usdcAddress = requireEnv("USDC_ADDRESS", "Canonical USDC address for the chain.");
    if (usdtAddress) usdtAddress = requireEnv("USDT_ADDRESS", "Canonical USDT address for the chain.");
  }
  if (usdcAddress) {
    await (await nodeSale.setAcceptedToken(usdcAddress, true)).wait();
    console.log("USDC accepted:", usdcAddress);
  }
  if (usdtAddress) {
    await (await nodeSale.setAcceptedToken(usdtAddress, true)).wait();
    console.log("USDT accepted:", usdtAddress);
  }

  // --- Per-tier configuration ---
  // 40-tier price curve: Tier 1 at $500, +5% per tier (see docs/PRODUCT.md).
  // Contract tier indices are 0..39; the backend's DB tier column is
  // 1-indexed (display tier = contract index + 1).
  if (isMainnet()) {
    requireEnv("TOKEN_DECIMALS",     "6 on Arbitrum, 18 on BSC. Wrong value silently scales every tier price.");
    requireEnv("LOCAL_TIER_CAP",     "Per-chain hard cap per tier (e.g. 1250). Defaulting on mainnet would over-cap one chain.");
    requireEnv("ADMIN_CAP_PER_TIER", "Admin-mint budget per tier (e.g. 1250). Defaulting on mainnet would mis-size the admin allocation.");
  }
  const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "6");
  const LOCAL_TIER_CAP = parseInt(process.env.LOCAL_TIER_CAP || "1250");
  const ADMIN_CAP_PER_TIER = parseInt(process.env.ADMIN_CAP_PER_TIER || "1250");

  const tierPricesUsd = Array.from({ length: 40 }, (_, i) =>
    Math.round(500 * Math.pow(1.05, i) * 100) / 100
  );

  for (let i = 0; i < 40; i++) {
    const minPrice =
      BigInt(Math.round(tierPricesUsd[i] * 100)) * BigInt(10 ** (TOKEN_DECIMALS - 2));

    await (await nodeSale.setTierMinPrice(i, minPrice)).wait();
    await (await nodeSale.setLocalTierCap(i, LOCAL_TIER_CAP)).wait();
    await (await nodeSale.setAdminCap(i, ADMIN_CAP_PER_TIER)).wait();

    console.log(
      `Tier ${i}: minPrice=$${tierPricesUsd[i]} (${minPrice} base) ` +
      `localCap=${LOCAL_TIER_CAP} adminCap=${ADMIN_CAP_PER_TIER}`
    );
  }

  console.log("\n--- Deployment Summary ---");
  console.log("OperonNode:    ", nodeAddress);
  console.log("NodeSale (v2): ", saleAddress);
  console.log("Treasury:      ", treasuryAddress);
  console.log("VoucherSigner: ", voucherSignerAddress);
  console.log("Deployer:      ", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
