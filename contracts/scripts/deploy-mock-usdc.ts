import { ethers } from "hardhat";

/**
 * Deploys a mock ERC20 token (USDC) for testnet testing.
 * This token has a public mint function so anyone can get test tokens.
 * NEVER use this on mainnet.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Mock USDC with account:", deployer.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUsdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
  await mockUsdc.waitForDeployment();
  const address = await mockUsdc.getAddress();
  console.log("Mock USDC deployed to:", address);

  // Mint 1,000,000 USDC to deployer for testing
  const mintAmount = ethers.parseUnits("1000000", 6);
  const mintTx = await mockUsdc.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log(`Minted 1,000,000 USDC to ${deployer.address}`);

  console.log("\n--- Use this address as USDC_ADDRESS in deploy.ts ---");
  console.log("USDC_ADDRESS=" + address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
