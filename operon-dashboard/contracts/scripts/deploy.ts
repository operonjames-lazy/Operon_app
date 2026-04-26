import { ethers } from "hardhat";

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

  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  const voucherSignerAddress = process.env.VOUCHER_SIGNER_ADDRESS;
  if (!voucherSignerAddress) {
    throw new Error("VOUCHER_SIGNER_ADDRESS env var is required");
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
  const usdcAddress = process.env.USDC_ADDRESS;
  const usdtAddress = process.env.USDT_ADDRESS;
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
