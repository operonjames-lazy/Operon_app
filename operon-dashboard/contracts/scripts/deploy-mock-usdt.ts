import { ethers } from "hardhat";

/**
 * Deploys a mock ERC20 token (USDT, 18 decimals) for BSC testnet testing.
 * Mirrors deploy-mock-usdc.ts but with BSC's token convention — symbol USDT
 * and 18 decimals — to match NEXT_PUBLIC_TESTNET_USDT_BSC and the
 * TOKEN_DECIMALS=18 price calculation in deploy.ts. Using deploy-mock-usdc.ts
 * on BSC (as R6 testers did) produces a 6-decimal token and tier prices are
 * then 10^12× too large for any approve/transferFrom to succeed.
 *
 * NEVER use this on mainnet.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Mock USDT with account:", deployer.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUsdt = await MockERC20.deploy("Mock USDT", "USDT", 18);
  await mockUsdt.waitForDeployment();
  const address = await mockUsdt.getAddress();
  console.log("Mock USDT deployed to:", address);

  // Mint 1,000,000 USDT to deployer for testing (18 decimals).
  const mintAmount = ethers.parseUnits("1000000", 18);
  const mintTx = await mockUsdt.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log(`Minted 1,000,000 USDT to ${deployer.address}`);

  // deploy.ts reads `USDC_ADDRESS` as "the accepted stablecoin address for
  // this chain", regardless of which symbol the token actually is. On BSC
  // the token is USDT — but the env var name is preserved for
  // compatibility with the shared deploy script. The guide (Part 3.4)
  // tells the tester the same thing.
  console.log("\n--- Use this address as USDC_ADDRESS when running deploy.ts on BSC ---");
  console.log("    (deploy.ts uses USDC_ADDRESS as the generic 'accepted stable' variable;");
  console.log("     on BSC the underlying token is USDT, 18 decimals — this is intentional.)");
  console.log("USDC_ADDRESS=" + address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
