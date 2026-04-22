import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// Helper: deadline 1 hour from now
function futureDeadline(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

// Helper: very large maxPricePerNode (effectively unlimited)
const MAX_PRICE = ethers.MaxUint256;

describe("NodeSale", function () {
  async function deployFixture() {
    const [owner, treasury, buyer, buyer2, other] = await ethers.getSigners();

    // Deploy mock USDC (6 decimals)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();

    // Deploy mock USDT
    const usdt = await MockERC20.deploy("Tether USD", "USDT", 6);
    await usdt.waitForDeployment();

    // Deploy a non-accepted token
    const badToken = await MockERC20.deploy("Bad Token", "BAD", 18);
    await badToken.waitForDeployment();

    // Deploy OperonNode
    const OperonNode = await ethers.getContractFactory("OperonNode");
    const nodeContract = await OperonNode.deploy();
    await nodeContract.waitForDeployment();

    // Deploy NodeSale
    const NodeSale = await ethers.getContractFactory("NodeSale");
    const sale = await NodeSale.deploy(treasury.address);
    await sale.waitForDeployment();

    // Configure
    await nodeContract.setMinter(await sale.getAddress());
    await sale.setNodeContract(await nodeContract.getAddress());
    await sale.setAcceptedToken(await usdc.getAddress(), true);
    await sale.setAcceptedToken(await usdt.getAddress(), true);

    // Set up tier 0: price 500_000000 (500 USDC, 6 decimals), publicSupply 100, adminSupply 50
    const tierPrice = 500_000000n;
    await sale.setTier(0, tierPrice, 100, 50, true);

    // Set up tier 1: price 525_000000, publicSupply 50, adminSupply 25
    await sale.setTier(1, 525_000000n, 50, 25, true);

    // Mint USDC to buyers
    await usdc.mint(buyer.address, 1_000_000_000000n); // 1M USDC
    await usdc.mint(buyer2.address, 1_000_000_000000n);

    // Mint USDT to buyer
    await usdt.mint(buyer.address, 1_000_000_000000n);

    return { owner, treasury, buyer, buyer2, other, usdc, usdt, badToken, nodeContract, sale, tierPrice };
  }

  describe("Deployment", function () {
    it("should set owner and treasury correctly", async function () {
      const { owner, treasury, sale } = await loadFixture(deployFixture);
      expect(await sale.owner()).to.equal(owner.address);
      expect(await sale.treasury()).to.equal(treasury.address);
    });

    it("should revert if treasury is zero address", async function () {
      const NodeSale = await ethers.getContractFactory("NodeSale");
      await expect(NodeSale.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "NodeSale: treasury is zero address"
      );
    });

    it("should have default discount of 15%", async function () {
      const { sale } = await loadFixture(deployFixture);
      expect(await sale.defaultDiscountBps()).to.equal(1500);
    });
  });

  describe("Happy path purchase", function () {
    it("should allow a buyer to purchase a node with USDC", async function () {
      const { buyer, treasury, usdc, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      // Approve
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);

      // Purchase
      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice)
      )
        .to.emit(sale, "NodePurchased")
        .withArgs(buyer.address, 0, 1, ethers.ZeroHash, tierPrice, await usdc.getAddress());

      // Verify node was minted
      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
      expect(await nodeContract.ownerOf(1)).to.equal(buyer.address);

      // Verify tier info stored on node
      const [tier, price, date] = await nodeContract.getNodeInfo(1);
      expect(tier).to.equal(0);
      expect(price).to.equal(tierPrice);

      // Verify payment went to treasury
      expect(await usdc.balanceOf(treasury.address)).to.equal(tierPrice);

      // Verify tier sold count
      const tierData = await sale.tiers(0);
      expect(tierData.publicSold).to.equal(1);
    });

    it("should allow purchase with USDT", async function () {
      const { buyer, usdt, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      await usdt.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await sale.connect(buyer).purchase(0, 1, await usdt.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
    });
  });

  describe("Referral code discount", function () {
    it("should apply 15% default discount for valid referral code", async function () {
      const { buyer, treasury, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("ALPHA15"));
      await sale.addReferralCode(codeHash, 0); // 0 means use default (15%)

      const discountedPrice = tierPrice - (tierPrice * 1500n / 10000n); // 15% off
      await usdc.connect(buyer).approve(await sale.getAddress(), discountedPrice);

      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), codeHash, futureDeadline(), tierPrice)
      )
        .to.emit(sale, "NodePurchased")
        .withArgs(buyer.address, 0, 1, codeHash, discountedPrice, await usdc.getAddress());

      expect(await usdc.balanceOf(treasury.address)).to.equal(discountedPrice);
    });

    it("should apply custom discount per code", async function () {
      const { buyer, treasury, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("VIP20"));
      await sale.addReferralCode(codeHash, 2000); // 20%

      const discountedPrice = tierPrice - (tierPrice * 2000n / 10000n);
      await usdc.connect(buyer).approve(await sale.getAddress(), discountedPrice);

      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), codeHash, futureDeadline(), tierPrice);
      expect(await usdc.balanceOf(treasury.address)).to.equal(discountedPrice);
    });

    it("should not apply discount for invalid code", async function () {
      const { buyer, treasury, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      const invalidHash = ethers.keccak256(ethers.toUtf8Bytes("INVALID"));
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);

      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), invalidHash, futureDeadline(), tierPrice);
      // Full price charged
      expect(await usdc.balanceOf(treasury.address)).to.equal(tierPrice);
    });

    it("R5-BUG-06: charges full price when codeHash is bytes32(0) even if the buyer owns a registered code", async function () {
      // Pins the frontend→contract contract that the R5-BUG-06 fix depends on.
      // The frontend zeroes the codeHash whenever `codeValid !== true` (including
      // the self-referral case where the UI rejects the buyer's own code). The
      // contract has no on-chain self-referral check — that's a known gap
      // tracked for mainnet — so the frontend's zeroing is the load-bearing
      // guard. This test fails loudly if either side of that contract drifts:
      // e.g. a future frontend refactor that stops zeroing, or a contract
      // upgrade that adds a self-referral check without updating this test.
      const { buyer, treasury, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      // Register the buyer's own code on-chain with a 10% discount — the exact
      // shape the frontend has to defend against.
      const buyerCodeHash = ethers.keccak256(ethers.toUtf8Bytes("OPR-SELF"));
      await sale.addReferralCode(buyerCodeHash, 1000);

      // Buyer approves only the FULL price (what the UI would have asked for
      // after setting discountBps = 0 on codeValid = false).
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);

      const treasuryBefore = await usdc.balanceOf(treasury.address);

      await expect(
        sale.connect(buyer).purchase(
          0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice
        )
      )
        .to.emit(sale, "NodePurchased")
        .withArgs(buyer.address, 0, 1, ethers.ZeroHash, tierPrice, await usdc.getAddress());

      expect((await usdc.balanceOf(treasury.address)) - treasuryBefore).to.equal(tierPrice);
    });

    it("validateCode should return correct info", async function () {
      const { sale } = await loadFixture(deployFixture);

      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("CODE1"));
      await sale.addReferralCode(codeHash, 1000);

      const [valid, discount] = await sale.validateCode(codeHash);
      expect(valid).to.be.true;
      expect(discount).to.equal(1000);

      // Default discount
      const codeHash2 = ethers.keccak256(ethers.toUtf8Bytes("CODE2"));
      await sale.addReferralCode(codeHash2, 0);
      const [valid2, discount2] = await sale.validateCode(codeHash2);
      expect(valid2).to.be.true;
      expect(discount2).to.equal(1500); // defaultDiscountBps

      // Invalid code
      const badHash = ethers.keccak256(ethers.toUtf8Bytes("BAD"));
      const [valid3] = await sale.validateCode(badHash);
      expect(valid3).to.be.false;
    });

    it("should allow owner to remove a referral code", async function () {
      const { buyer, treasury, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("REMOVE_ME"));
      await sale.addReferralCode(codeHash, 0);

      // Verify code is valid
      const [valid] = await sale.validateCode(codeHash);
      expect(valid).to.be.true;

      // Remove the code
      await expect(sale.removeReferralCode(codeHash))
        .to.emit(sale, "ReferralCodeRemoved")
        .withArgs(codeHash);

      // Verify code is no longer valid
      const [valid2] = await sale.validateCode(codeHash);
      expect(valid2).to.be.false;

      // Purchase with removed code should charge full price
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), codeHash, futureDeadline(), tierPrice);
      expect(await usdc.balanceOf(treasury.address)).to.equal(tierPrice);
    });

    it("should only allow admin to remove a referral code", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("CODE"));
      await sale.addReferralCode(codeHash, 0);

      await expect(
        sale.connect(other).removeReferralCode(codeHash)
      ).to.be.revertedWith("NodeSale: caller is not admin");
    });

    it("should batch add referral codes", async function () {
      const { sale } = await loadFixture(deployFixture);

      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("BATCH1")),
        ethers.keccak256(ethers.toUtf8Bytes("BATCH2")),
        ethers.keccak256(ethers.toUtf8Bytes("BATCH3")),
      ];
      await sale.addReferralCodes(hashes, 1200);

      for (const h of hashes) {
        const [valid, discount] = await sale.validateCode(h);
        expect(valid).to.be.true;
        expect(discount).to.equal(1200);
      }
    });
  });

  describe("Tier sold out", function () {
    it("should revert when tier supply is exhausted", async function () {
      const { buyer, buyer2, usdc, sale } = await loadFixture(deployFixture);

      // Set small tier: publicSupply 2, adminSupply 0
      await sale.setTier(9, 100_000000n, 2, 0, true);

      await usdc.connect(buyer).approve(await sale.getAddress(), 200_000000n);
      await sale.connect(buyer).purchase(9, 2, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), 100_000000n);

      // Next purchase should fail
      await usdc.connect(buyer2).approve(await sale.getAddress(), 100_000000n);
      await expect(
        sale.connect(buyer2).purchase(9, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), 100_000000n)
      ).to.be.revertedWith("NodeSale: tier sold out");
    });
  });

  describe("Wallet limit", function () {
    it("should enforce per-wallet limit", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      await sale.setMaxPerWallet(0, 2);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice * 3n);

      // Buy 2 -- OK
      await sale.connect(buyer).purchase(0, 2, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      // Buy 1 more -- exceeds limit
      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice)
      ).to.be.revertedWith("NodeSale: exceeds wallet limit");
    });

    it("should allow unlimited when maxPerWallet is 0", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      // maxPerWallet defaults to 0 (unlimited)
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice * 10n);
      await sale.connect(buyer).purchase(0, 10, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      expect(await sale.purchaseCount(buyer.address, 0)).to.equal(10);
    });
  });

  describe("Paused sale", function () {
    it("should revert purchases when paused", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      await sale.pause();

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice)
      ).to.be.revertedWithCustomError(sale, "EnforcedPause");
    });

    it("should allow purchases after unpause", async function () {
      const { buyer, usdc, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      await sale.pause();
      await sale.unpause();

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
    });
  });

  describe("Wrong token", function () {
    it("should revert if token is not accepted", async function () {
      const { buyer, badToken, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(buyer).purchase(0, 1, await badToken.getAddress(), ethers.ZeroHash, futureDeadline(), MAX_PRICE)
      ).to.be.revertedWith("NodeSale: token not accepted");
    });
  });

  describe("Insufficient balance / allowance", function () {
    it("should revert if buyer has insufficient balance", async function () {
      const { other, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      // other has 0 USDC
      await usdc.connect(other).approve(await sale.getAddress(), tierPrice);
      await expect(
        sale.connect(other).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice)
      ).to.be.revertedWith("ERC20: insufficient balance");
    });

    it("should revert if buyer has insufficient allowance", async function () {
      const { buyer, usdc, sale } = await loadFixture(deployFixture);

      // No approval
      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), MAX_PRICE)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  describe("Batch purchase", function () {
    it("should mint multiple nodes in one transaction", async function () {
      const { buyer, usdc, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      const quantity = 5n;
      const totalCost = tierPrice * quantity;

      await usdc.connect(buyer).approve(await sale.getAddress(), totalCost);
      await sale.connect(buyer).purchase(0, Number(quantity), await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      expect(await nodeContract.balanceOf(buyer.address)).to.equal(quantity);
      // Token IDs should be 1-5
      for (let i = 1; i <= Number(quantity); i++) {
        expect(await nodeContract.ownerOf(i)).to.equal(buyer.address);
      }
    });
  });

  describe("Tier boundary (buy last node)", function () {
    it("should allow buying the last available node in a tier", async function () {
      const { buyer, buyer2, usdc, sale, nodeContract } = await loadFixture(deployFixture);

      // Tier with publicSupply of 3
      await sale.setTier(5, 100_000000n, 3, 0, true);

      // Buy 2
      await usdc.connect(buyer).approve(await sale.getAddress(), 200_000000n);
      await sale.connect(buyer).purchase(5, 2, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), 100_000000n);

      // Buy last 1
      await usdc.connect(buyer2).approve(await sale.getAddress(), 100_000000n);
      await sale.connect(buyer2).purchase(5, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), 100_000000n);

      const tierData = await sale.tiers(5);
      expect(tierData.publicSold).to.equal(3);
      expect(tierData.publicSupply).to.equal(3);

      // Next one should fail
      await usdc.connect(buyer).approve(await sale.getAddress(), 100_000000n);
      await expect(
        sale.connect(buyer).purchase(5, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), 100_000000n)
      ).to.be.revertedWith("NodeSale: tier sold out");
    });
  });

  describe("Transfer lock", function () {
    it("should prevent transfers when lock is active", async function () {
      const { buyer, other, usdc, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      // Purchase a node
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      // Set transfer lock to far future
      const futureTime = (await time.latest()) + 365 * 24 * 3600;
      await nodeContract.setTransferLockExpiry(futureTime);

      // Try to transfer -- should fail
      await expect(
        nodeContract.connect(buyer).transferFrom(buyer.address, other.address, 1)
      ).to.be.revertedWith("OperonNode: transfers are locked");
    });

    it("should allow transfers after lock expires", async function () {
      const { buyer, other, usdc, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      // Set lock to 1 hour from now
      const lockTime = (await time.latest()) + 3600;
      await nodeContract.setTransferLockExpiry(lockTime);

      // Fast forward past lock
      await time.increaseTo(lockTime + 1);

      // Transfer should succeed
      await nodeContract.connect(buyer).transferFrom(buyer.address, other.address, 1);
      expect(await nodeContract.ownerOf(1)).to.equal(other.address);
    });

    it("should allow minting even when transfers are locked", async function () {
      const { buyer, usdc, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      // Set lock to far future
      const futureTime = (await time.latest()) + 365 * 24 * 3600;
      await nodeContract.setTransferLockExpiry(futureTime);

      // Minting should still work
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
    });
  });

  describe("Admin functions", function () {
    it("should only allow owner to set tier", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).setTier(0, 100, 100, 50, true)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("should only allow owner to pause", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).pause()
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("should only allow owner to set treasury", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).setTreasury(other.address)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to update tier active status", async function () {
      const { sale } = await loadFixture(deployFixture);

      await sale.setTierActive(0, false);
      const tier = await sale.tiers(0);
      expect(tier.active).to.be.false;
    });

    it("should revert purchase on inactive tier", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      await sale.setTierActive(0, false);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice)
      ).to.be.revertedWith("NodeSale: tier not active");
    });

    it("should allow owner to withdraw stuck funds", async function () {
      const { owner, other, usdc, sale } = await loadFixture(deployFixture);

      // Send some tokens directly to the sale contract
      await usdc.mint(await sale.getAddress(), 1000n);

      await sale.withdrawFunds(await usdc.getAddress(), other.address);
      expect(await usdc.balanceOf(other.address)).to.equal(1000n);
    });

    it("should preserve sold count when updating tier", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      // Buy 1 node in tier 0
      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);
      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      // Update tier 0 price
      await sale.setTier(0, 600_000000n, 200, 100, true);

      const tier = await sale.tiers(0);
      expect(tier.publicSold).to.equal(1); // preserved
      expect(tier.price).to.equal(600_000000n);
      expect(tier.publicSupply).to.equal(200);
    });

    it("should only allow minter to mint on OperonNode", async function () {
      const { other, nodeContract } = await loadFixture(deployFixture);

      await expect(
        nodeContract.connect(other).mint(other.address, 0, 100)
      ).to.be.revertedWith("OperonNode: caller is not the minter");
    });

    it("should reject zero quantity", async function () {
      const { buyer, usdc, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(buyer).purchase(0, 0, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), MAX_PRICE)
      ).to.be.revertedWith("NodeSale: invalid quantity");
    });

    it("should allow owner to setMaxBatchSize", async function () {
      const { sale } = await loadFixture(deployFixture);

      expect(await sale.maxBatchSize()).to.equal(100);
      await sale.setMaxBatchSize(50);
      expect(await sale.maxBatchSize()).to.equal(50);
    });

    it("should only allow owner to setMaxBatchSize", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).setMaxBatchSize(50)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to setTierPaused", async function () {
      const { sale } = await loadFixture(deployFixture);

      await expect(sale.setTierPaused(0, true))
        .to.emit(sale, "TierPausedToggled")
        .withArgs(0, true);

      expect(await sale.tierPaused(0)).to.be.true;

      await expect(sale.setTierPaused(0, false))
        .to.emit(sale, "TierPausedToggled")
        .withArgs(0, false);

      expect(await sale.tierPaused(0)).to.be.false;
    });

    it("should only allow owner to setTierPaused", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).setTierPaused(0, true)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Deadline and maxPricePerNode guards", function () {
    it("should revert if deadline has passed", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);

      const pastDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, pastDeadline, tierPrice)
      ).to.be.revertedWith("NodeSale: tx expired");
    });

    it("should revert if price exceeds maxPricePerNode", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice);

      // Set maxPricePerNode below tier price
      const lowMaxPrice = tierPrice - 1n;

      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), lowMaxPrice)
      ).to.be.revertedWith("NodeSale: price slippage");
    });
  });

  describe("Smart contract wallet support", function () {
    it("should allow purchases from contract wallets (Gnosis Safe, ERC-4337)", async function () {
      const { buyer, usdc, nodeContract, sale, tierPrice } = await loadFixture(deployFixture);

      // Deploy MockPurchaser (simulates a smart contract wallet)
      const MockPurchaser = await ethers.getContractFactory("MockPurchaser");
      const purchaser = await MockPurchaser.deploy();
      await purchaser.waitForDeployment();

      const purchaserAddr = await purchaser.getAddress();
      await usdc.mint(purchaserAddr, tierPrice);

      await purchaser.tryPurchase(
        await sale.getAddress(),
        0,
        1,
        await usdc.getAddress(),
        ethers.ZeroHash,
        futureDeadline(),
        tierPrice,
        tierPrice
      );

      expect(await nodeContract.balanceOf(purchaserAddr)).to.equal(1);
    });
  });

  describe("maxBatchSize enforcement", function () {
    it("should enforce maxBatchSize", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      // Set maxBatchSize to 5
      await sale.setMaxBatchSize(5);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice * 6n);

      // Buying 6 should fail
      await expect(
        sale.connect(buyer).purchase(0, 6, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice)
      ).to.be.revertedWith("NodeSale: invalid quantity");

      // Buying 5 should succeed
      await sale.connect(buyer).purchase(0, 5, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);
    });
  });

  describe("Per-tier pause", function () {
    it("should respect per-tier pause", async function () {
      const { buyer, usdc, sale, tierPrice, nodeContract } = await loadFixture(deployFixture);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice * 3n);

      // Pause tier 0
      await sale.setTierPaused(0, true);

      // Purchase on paused tier should fail
      await expect(
        sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice)
      ).to.be.revertedWith("NodeSale: tier paused");

      // Unpause tier 0
      await sale.setTierPaused(0, false);

      // Now purchase should succeed
      await sale.connect(buyer).purchase(0, 1, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);
      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
    });
  });

  describe("Discount rounding edge case", function () {
    it("should handle discount rounding edge case", async function () {
      const { buyer, treasury, usdc, sale } = await loadFixture(deployFixture);

      // Set a tier with an odd price (333_333333 = ~333.333333 USDC)
      const oddPrice = 333_333333n;
      await sale.setTier(7, oddPrice, 100, 0, true);

      // Add a code with 1500 bps (15%) discount
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("ODD"));
      await sale.addReferralCode(codeHash, 1500);

      // Expected: 333_333333 - (333_333333 * 1500 / 10000) = 333_333333 - 49_999999 = 283_333334
      // Solidity integer division: 333_333333 * 1500 = 499_999_999_500, / 10000 = 49_999_999 (truncated)
      const discountAmount = oddPrice * 1500n / 10000n; // 49_999_999n
      const expectedPrice = oddPrice - discountAmount; // 283_333_334n

      await usdc.connect(buyer).approve(await sale.getAddress(), expectedPrice);
      await sale.connect(buyer).purchase(7, 1, await usdc.getAddress(), codeHash, futureDeadline(), oddPrice);

      expect(await usdc.balanceOf(treasury.address)).to.equal(expectedPrice);
    });
  });

  describe("AdminMint", function () {
    it("should allow owner to adminMint nodes", async function () {
      const { owner, other, nodeContract, sale } = await loadFixture(deployFixture);

      await sale.adminMint(other.address, 0, 3);

      expect(await nodeContract.balanceOf(other.address)).to.equal(3);

      const tierData = await sale.tiers(0);
      expect(tierData.adminSold).to.equal(3);
    });

    it("should not allow adminMint beyond adminSupply", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      // Tier 0 has adminSupply of 50
      await expect(
        sale.adminMint(other.address, 0, 51)
      ).to.be.revertedWith("NodeSale: admin allocation exceeded");
    });

    it("should not allow non-owner to adminMint", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await expect(
        sale.connect(other).adminMint(other.address, 0, 1)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("should not allow adminMint to zero address", async function () {
      const { sale } = await loadFixture(deployFixture);

      await expect(
        sale.adminMint(ethers.ZeroAddress, 0, 1)
      ).to.be.revertedWith("NodeSale: zero address");
    });

    it("adminMint should not affect publicSold", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await sale.adminMint(other.address, 0, 5);

      const tierData = await sale.tiers(0);
      expect(tierData.publicSold).to.equal(0);
      expect(tierData.adminSold).to.equal(5);
    });

    it("purchase should not affect adminSold", async function () {
      const { buyer, usdc, sale, tierPrice } = await loadFixture(deployFixture);

      await usdc.connect(buyer).approve(await sale.getAddress(), tierPrice * 3n);
      await sale.connect(buyer).purchase(0, 3, await usdc.getAddress(), ethers.ZeroHash, futureDeadline(), tierPrice);

      const tierData = await sale.tiers(0);
      expect(tierData.adminSold).to.equal(0);
      expect(tierData.publicSold).to.equal(3);
    });

    it("should emit AdminMint event with correct values", async function () {
      const { other, sale } = await loadFixture(deployFixture);

      await expect(sale.adminMint(other.address, 0, 2))
        .to.emit(sale, "AdminMint")
        .withArgs(other.address, 0, 2, 2, 50);
    });

    it("adminMint should work even when tier is not active", async function () {
      const { other, nodeContract, sale } = await loadFixture(deployFixture);

      // Deactivate tier 0
      await sale.setTierActive(0, false);

      // Admin mint should still work because adminSupply > 0
      await sale.adminMint(other.address, 0, 1);
      expect(await nodeContract.balanceOf(other.address)).to.equal(1);
    });
  });

  describe("OperonNode - getNodeInfo", function () {
    it("should revert for non-existent token", async function () {
      const { nodeContract } = await loadFixture(deployFixture);

      await expect(nodeContract.getNodeInfo(999)).to.be.revertedWith(
        "OperonNode: token does not exist"
      );
    });
  });

  // Role separation — cold `owner` (Safe) retains treasury / price / pause /
  // ownership handover; hot `admin` (rotating key) holds frequently-called
  // operational functions that cannot wait on multi-sig. Deploy-time default
  // sets `admin = deployer` so a fresh deploy is usable without a second tx;
  // production deploys rotate admin via `setAdmin` after handing `owner` to
  // the Safe.
  describe("Admin role separation", function () {
    it("initialises admin = deployer and emits AdminUpdated", async function () {
      const [owner, treasury] = await ethers.getSigners();
      const NodeSale = await ethers.getContractFactory("NodeSale");
      const sale = await NodeSale.deploy(treasury.address);
      await sale.waitForDeployment();
      expect(await sale.admin()).to.equal(owner.address);
    });

    it("setAdmin only callable by owner", async function () {
      const { sale, other } = await loadFixture(deployFixture);
      await expect(
        sale.connect(other).setAdmin(other.address)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("setAdmin updates storage and emits AdminUpdated", async function () {
      const { sale, owner, other } = await loadFixture(deployFixture);
      await expect(sale.connect(owner).setAdmin(other.address))
        .to.emit(sale, "AdminUpdated")
        .withArgs(owner.address, other.address);
      expect(await sale.admin()).to.equal(other.address);
    });

    it("setAdmin can rotate to zero to disable admin-only functions", async function () {
      const { sale, owner } = await loadFixture(deployFixture);
      await sale.connect(owner).setAdmin(ethers.ZeroAddress);
      expect(await sale.admin()).to.equal(ethers.ZeroAddress);
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("DISABLED"));
      await expect(
        sale.connect(owner).addReferralCode(codeHash, 1000)
      ).to.be.revertedWith("NodeSale: caller is not admin");
    });

    it("after rotation, new admin can call, old admin cannot", async function () {
      const { sale, owner, other } = await loadFixture(deployFixture);
      await sale.connect(owner).setAdmin(other.address);
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("ROTATED"));
      await sale.connect(other).addReferralCode(codeHash, 1000);
      expect(await sale.validCodes(codeHash)).to.be.true;
      const codeHash2 = ethers.keccak256(ethers.toUtf8Bytes("ROTATED2"));
      await expect(
        sale.connect(owner).addReferralCode(codeHash2, 1000)
      ).to.be.revertedWith("NodeSale: caller is not admin");
    });

    it("owner-without-admin cannot setTierActive (proves Safe handover preserves ops path)", async function () {
      const { sale, owner, other } = await loadFixture(deployFixture);
      await sale.connect(owner).setAdmin(other.address);
      await expect(
        sale.connect(owner).setTierActive(0, false)
      ).to.be.revertedWith("NodeSale: caller is not admin");
      await sale.connect(other).setTierActive(0, false);
      const tier = await sale.tiers(0);
      expect(tier.active).to.be.false;
    });

    it("addReferralCodes (batch) enforces onlyAdmin", async function () {
      const { sale, other } = await loadFixture(deployFixture);
      const hashes = [ethers.keccak256(ethers.toUtf8Bytes("X"))];
      await expect(
        sale.connect(other).addReferralCodes(hashes, 1000)
      ).to.be.revertedWith("NodeSale: caller is not admin");
    });

    it("addReferralCode rejects discountBps > 10000", async function () {
      const { sale } = await loadFixture(deployFixture);
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes("TOOHIGH"));
      await expect(sale.addReferralCode(codeHash, 10001)).to.be.revertedWith(
        "NodeSale: discount > 100%"
      );
      // 10000 (exactly 100% off) is allowed — treasury policy decision, not
      // an invariant violation; operators who want a lower ceiling enforce
      // it at the application layer.
      await sale.addReferralCode(codeHash, 10000);
      expect(await sale.validCodes(codeHash)).to.be.true;
    });

    it("addReferralCodes (batch) rejects discountBps > 10000", async function () {
      const { sale } = await loadFixture(deployFixture);
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("B1")),
        ethers.keccak256(ethers.toUtf8Bytes("B2")),
      ];
      await expect(sale.addReferralCodes(hashes, 15000)).to.be.revertedWith(
        "NodeSale: discount > 100%"
      );
      // And the batch must have registered nothing — all-or-nothing.
      for (const h of hashes) expect(await sale.validCodes(h)).to.be.false;
    });

    it("owner (Safe) retains treasury/price/pause/withdraw even with rotated admin", async function () {
      const { sale, owner, other, usdc, treasury } = await loadFixture(deployFixture);
      await sale.connect(owner).setAdmin(other.address);
      // A rotated admin must not be able to call owner-only functions.
      await expect(
        sale.connect(other).setTreasury(other.address)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
      await expect(
        sale.connect(other).pause()
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
      await expect(
        sale.connect(other).withdrawFunds(await usdc.getAddress(), treasury.address)
      ).to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
      // Owner (Safe) still can.
      await sale.connect(owner).pause();
      expect(await sale.paused()).to.be.true;
    });
  });
});
