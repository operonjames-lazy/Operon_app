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
  // Whitelist tiers with 5% increment pricing
  // Prices converted to token-decimal amounts (e.g. 6 decimals for Arbitrum USDC/USDT)
  const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '6');

  const tierPricesUsd = [500, 525, 551.25, 578.81, 607.75]; // USD prices
  const tierConfigs = tierPricesUsd.map((price, i) => ({
    id: i,
    price: BigInt(Math.round(price * 100)) * BigInt(10 ** (TOKEN_DECIMALS - 2)), // Convert USD to token units
    supply: i === 0 ? 1250 : 1250, // Match the spec: 1250 per whitelist tier
    active: i === 0, // Only tier 0 active initially
  }));

  for (const tier of tierConfigs) {
    const tx = await nodeSale.setTier(tier.id, tier.price, tier.supply, tier.active);
    await tx.wait();
    console.log(`Tier ${tier.id} set: price=${tier.price} supply=${tier.supply} active=${tier.active}`);
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
