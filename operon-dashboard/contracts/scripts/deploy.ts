import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // --- Deploy OperonNode ---
  const OperonNode = await ethers.getContractFactory("OperonNode");
  const operonNode = await OperonNode.deploy();
  await operonNode.waitForDeployment();
  const nodeAddress = await operonNode.getAddress();
  console.log("OperonNode deployed to:", nodeAddress);

  // --- Deploy NodeSale ---
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  const NodeSale = await ethers.getContractFactory("NodeSale");
  const nodeSale = await NodeSale.deploy(treasuryAddress);
  await nodeSale.waitForDeployment();
  const saleAddress = await nodeSale.getAddress();
  console.log("NodeSale deployed to:", saleAddress);

  // --- Configure OperonNode: set minter to NodeSale ---
  const setMinterTx = await operonNode.setMinter(saleAddress);
  await setMinterTx.wait();
  console.log("Minter set to NodeSale:", saleAddress);

  // --- Configure NodeSale: set node contract ---
  const setNodeTx = await nodeSale.setNodeContract(nodeAddress);
  await setNodeTx.wait();
  console.log("NodeContract set on NodeSale:", nodeAddress);

  // --- Set accepted tokens (USDC / USDT) ---
  // These addresses should be set via env vars for each chain
  const usdcAddress = process.env.USDC_ADDRESS;
  const usdtAddress = process.env.USDT_ADDRESS;

  if (usdcAddress) {
    const tx = await nodeSale.setAcceptedToken(usdcAddress, true);
    await tx.wait();
    console.log("USDC accepted:", usdcAddress);
  }

  if (usdtAddress) {
    const tx = await nodeSale.setAcceptedToken(usdtAddress, true);
    await tx.wait();
    console.log("USDT accepted:", usdtAddress);
  }

  // --- Set initial tiers ---
  // 40-tier price curve: Tier 1 at $500, +5% per tier (see docs/PRODUCT.md).
  // Contract tier indices are 0..39; the dashboard's DB tier column is 1-indexed
  // (tier display ID = contract index + 1).
  //
  // Ship-readiness R5: activate ONLY tier 0 at deploy time. Previously all
  // 40 tiers were marked active, which meant a buyer could call
  // `purchase(tier=39, ...)` on day one and skip the sequential curve —
  // product promise broken. The contract's `setTierActive` is wired to the
  // admin endpoint; subsequent tiers are promoted as inventory sells out.
  const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '6');

  const tierPricesUsd = Array.from({ length: 40 }, (_, i) =>
    Math.round(500 * Math.pow(1.05, i) * 100) / 100
  );
  const tierConfigs = tierPricesUsd.map((price, i) => ({
    id: i,
    price: BigInt(Math.round(price * 100)) * BigInt(10 ** (TOKEN_DECIMALS - 2)),
    publicSupply: 1250,   // public allocation
    adminSupply: 1250,    // admin/whitelist allocation
    active: i === 0,      // only tier 0 open at deploy; promote via setTierActive
  }));

  for (const tier of tierConfigs) {
    const tx = await nodeSale.setTier(tier.id, tier.price, tier.publicSupply, tier.adminSupply, tier.active);
    await tx.wait();
    console.log(`Tier ${tier.id} set: price=$${tierPricesUsd[tier.id]} (${tier.price} base units) supply=${tier.publicSupply}+${tier.adminSupply} active=${tier.active}`);
  }

  console.log("\n--- Deployment Summary ---");
  console.log("OperonNode:", nodeAddress);
  console.log("NodeSale:", saleAddress);
  console.log("Treasury:", treasuryAddress);
  console.log("Deployer:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
