import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─── Voucher helpers ──────────────────────────────────────────────
//
// Mirror of the Solidity `PurchaseVoucher` struct in NodeSale.sol. Field
// order MUST match the struct and the EIP-712 type string verbatim — any
// drift produces a different digest and the contract recovers a different
// signer, so the require fires.
type Voucher = {
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
};

const VOUCHER_TYPES = {
  PurchaseVoucher: [
    { name: "buyer", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "saleContract", type: "address" },
    { name: "tierId", type: "uint256" },
    { name: "quantity", type: "uint256" },
    { name: "token", type: "address" },
    { name: "unitPrice", type: "uint256" },
    { name: "discountBps", type: "uint16" },
    { name: "codeHash", type: "bytes32" },
    { name: "reservationId", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};

async function signVoucher(
  signer: HardhatEthersSigner,
  saleAddress: string,
  voucher: Voucher
): Promise<string> {
  const domain = {
    name: "OperonNodeSale",
    version: "2",
    chainId: voucher.chainId,
    verifyingContract: saleAddress,
  };
  return signer.signTypedData(domain, VOUCHER_TYPES, voucher);
}

function futureDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 3600);
}

function randomReservationId(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

describe("NodeSale (v2 voucher checkout)", function () {
  async function deployFixture() {
    const [owner, treasury, voucherSigner, buyer, buyer2, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    const usdt = await MockERC20.deploy("Tether USD", "USDT", 6);
    await usdt.waitForDeployment();
    const badToken = await MockERC20.deploy("Bad Token", "BAD", 18);
    await badToken.waitForDeployment();

    const OperonNode = await ethers.getContractFactory("OperonNode");
    const nodeContract = await OperonNode.deploy();
    await nodeContract.waitForDeployment();

    const NodeSale = await ethers.getContractFactory("NodeSale");
    const sale = await NodeSale.deploy(treasury.address, voucherSigner.address);
    await sale.waitForDeployment();

    await nodeContract.setMinter(await sale.getAddress());
    await sale.setNodeContract(await nodeContract.getAddress());
    await sale.setAcceptedToken(await usdc.getAddress(), true);
    await sale.setAcceptedToken(await usdt.getAddress(), true);

    // Tier 0 setup mirroring deploy.ts conventions: $500/node = 500_000000
    // base units at 6 decimals, public cap of 100, admin cap of 50.
    const tierPrice = 500_000000n;
    await sale.setTierMinPrice(0, tierPrice);
    await sale.setLocalTierCap(0, 100);
    await sale.setAdminCap(0, 50);

    await sale.setTierMinPrice(1, 525_000000n);
    await sale.setLocalTierCap(1, 50);
    await sale.setAdminCap(1, 25);

    await usdc.mint(buyer.address, 1_000_000_000000n);
    await usdc.mint(buyer2.address, 1_000_000_000000n);
    await usdt.mint(buyer.address, 1_000_000_000000n);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const saleAddress = await sale.getAddress();

    function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
      return {
        buyer: buyer.address,
        chainId,
        saleContract: saleAddress,
        tierId: 0n,
        quantity: 1n,
        token: "" as string, // filled by tests via override (USDC vs USDT)
        unitPrice: tierPrice,
        discountBps: 0,
        codeHash: ethers.ZeroHash,
        reservationId: randomReservationId(),
        deadline: futureDeadline(),
        ...overrides,
      };
    }

    return {
      owner, treasury, voucherSigner, buyer, buyer2, other,
      usdc, usdt, badToken, nodeContract, sale, tierPrice,
      chainId, saleAddress, makeVoucher,
    };
  }

  describe("Deployment", function () {
    it("sets owner, treasury, voucher signer", async function () {
      const { owner, treasury, voucherSigner, sale } = await loadFixture(deployFixture);
      expect(await sale.owner()).to.equal(owner.address);
      expect(await sale.treasury()).to.equal(treasury.address);
      expect(await sale.voucherSigner()).to.equal(voucherSigner.address);
    });

    it("reverts if treasury is zero", async function () {
      const [, , voucherSigner] = await ethers.getSigners();
      const NodeSale = await ethers.getContractFactory("NodeSale");
      await expect(NodeSale.deploy(ethers.ZeroAddress, voucherSigner.address))
        .to.be.revertedWith("NodeSale: treasury is zero address");
    });

    it("reverts if voucher signer is zero", async function () {
      const [, treasury] = await ethers.getSigners();
      const NodeSale = await ethers.getContractFactory("NodeSale");
      await expect(NodeSale.deploy(treasury.address, ethers.ZeroAddress))
        .to.be.revertedWith("NodeSale: voucher signer is zero address");
    });

    it("MAX_BATCH_SIZE constant is 100", async function () {
      const { sale } = await loadFixture(deployFixture);
      expect(await sale.MAX_BATCH_SIZE()).to.equal(100);
    });

    it("MAX_DISCOUNT_BPS constant is 1500", async function () {
      const { sale } = await loadFixture(deployFixture);
      expect(await sale.MAX_DISCOUNT_BPS()).to.equal(1500);
    });

    it("MAX_TIER_ID constant is 39", async function () {
      const { sale } = await loadFixture(deployFixture);
      expect(await sale.MAX_TIER_ID()).to.equal(39);
    });
  });

  describe("Happy path purchase", function () {
    it("purchases at full price with USDC and emits NodePurchased with reservationId", async function () {
      const { buyer, treasury, voucherSigner, usdc, nodeContract, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);

      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);

      await usdc.connect(buyer).approve(saleAddress, tierPrice);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.emit(sale, "NodePurchased")
        .withArgs(buyer.address, 0, 1, v.reservationId, ethers.ZeroHash, tierPrice, await usdc.getAddress());

      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
      expect(await nodeContract.ownerOf(1)).to.equal(buyer.address);
      expect(await usdc.balanceOf(treasury.address)).to.equal(tierPrice);
      expect(await sale.localTierSold(0)).to.equal(1);
      expect(await sale.usedReservations(v.reservationId)).to.be.true;
    });

    it("purchases with USDT", async function () {
      const { buyer, voucherSigner, usdt, nodeContract, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdt.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdt.connect(buyer).approve(saleAddress, tierPrice);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);
      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
    });

    it("batch purchase mints multiple nodes and emits aggregated totalPaid", async function () {
      const { buyer, voucherSigner, usdc, nodeContract, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);

      const v = makeVoucher({ token: await usdc.getAddress(), quantity: 5n });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(buyer).approve(saleAddress, tierPrice * 5n);

      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.emit(sale, "NodePurchased")
        .withArgs(buyer.address, 0, 5, v.reservationId, ethers.ZeroHash, tierPrice * 5n, await usdc.getAddress());

      expect(await nodeContract.balanceOf(buyer.address)).to.equal(5);
      for (let i = 1; i <= 5; i++) {
        expect(await nodeContract.ownerOf(i)).to.equal(buyer.address);
      }
    });
  });

  describe("Discount math", function () {
    it("applies a 15% discount via voucher.discountBps", async function () {
      const { buyer, treasury, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);

      const v = makeVoucher({ token: await usdc.getAddress(), discountBps: 1500 });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      const expected = tierPrice - (tierPrice * 1500n / 10000n);
      await usdc.connect(buyer).approve(saleAddress, expected);

      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.emit(sale, "NodePurchased")
        .withArgs(buyer.address, 0, 1, v.reservationId, ethers.ZeroHash, expected, await usdc.getAddress());
      expect(await usdc.balanceOf(treasury.address)).to.equal(expected);
    });

    it("rejects discount above MAX_DISCOUNT_BPS", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), discountBps: 1501 });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: discount too high");
    });

    it("handles odd-price rounding via integer division", async function () {
      const { buyer, treasury, voucherSigner, usdc, sale, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);

      // Set up tier 7 with an odd unit price.
      const oddPrice = 333_333333n;
      await sale.setTierMinPrice(7, oddPrice);
      await sale.setLocalTierCap(7, 10);

      const v = makeVoucher({
        token: await usdc.getAddress(),
        tierId: 7n,
        unitPrice: oddPrice,
        discountBps: 1500,
      });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      const discountAmount = oddPrice * 1500n / 10000n; // 49_999_999n
      const expected = oddPrice - discountAmount;       // 283_333_334n
      await usdc.connect(buyer).approve(saleAddress, expected);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);
      expect(await usdc.balanceOf(treasury.address)).to.equal(expected);
    });
  });

  describe("Voucher binding", function () {
    it("reverts if msg.sender != voucher.buyer", async function () {
      const { other, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.mint(other.address, tierPrice);
      await usdc.connect(other).approve(saleAddress, tierPrice);
      await expect(sale.connect(other).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: voucher buyer mismatch");
    });

    it("reverts on cross-chain replay (chainId mismatch)", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), chainId: 999_999n });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: wrong chain");
    });

    it("reverts if voucher.saleContract != address(this)", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), saleContract: ethers.Wallet.createRandom().address });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: wrong contract");
    });

    it("reverts on expired voucher", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const expired = BigInt(await time.latest()) - 1n;
      const v = makeVoucher({ token: await usdc.getAddress(), deadline: expired });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: voucher expired");
    });

    it("reverts on reservationId replay", async function () {
      const { buyer, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(buyer).approve(saleAddress, tierPrice * 2n);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);
      // Same voucher submitted twice — reservation already consumed.
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: reservation used");
    });

    it("reverts on signature signed by non-voucher-signer", async function () {
      const { buyer, other, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress() });
      // `other` is not the voucher signer — signature recovers to wrong address.
      const sig = await signVoucher(other, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: bad voucher signer");
    });

    it("reverts when voucher fields don't match the signed payload (tampered quantity)", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), quantity: 1n });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      // Mutate quantity after signing — recovered signer no longer matches.
      const tampered = { ...v, quantity: 5n };
      await expect(sale.connect(buyer).purchaseWithVoucher(tampered, sig))
        .to.be.revertedWith("NodeSale: bad voucher signer");
    });

    it("reverts when voucher tier is out of range", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), tierId: 40n });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: tier out of range");
    });
  });

  describe("Voucher signer rotation", function () {
    it("rotated signer's vouchers are accepted; old signer's are not", async function () {
      const { owner, buyer, other, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);

      // Rotate to `other`.
      await expect(sale.connect(owner).setVoucherSigner(other.address))
        .to.emit(sale, "VoucherSignerUpdated")
        .withArgs(voucherSigner.address, other.address);
      expect(await sale.voucherSigner()).to.equal(other.address);

      // Old signer's voucher rejected.
      const v1 = makeVoucher({ token: await usdc.getAddress() });
      const oldSig = await signVoucher(voucherSigner, saleAddress, v1);
      await usdc.connect(buyer).approve(saleAddress, tierPrice);
      await expect(sale.connect(buyer).purchaseWithVoucher(v1, oldSig))
        .to.be.revertedWith("NodeSale: bad voucher signer");

      // New signer's voucher accepted.
      const v2 = makeVoucher({ token: await usdc.getAddress() });
      const newSig = await signVoucher(other, saleAddress, v2);
      await sale.connect(buyer).purchaseWithVoucher(v2, newSig);
    });

    it("setVoucherSigner is onlyOwner", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).setVoucherSigner(other.address))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("setVoucherSigner rejects zero address", async function () {
      const { sale } = await loadFixture(deployFixture);
      await expect(sale.setVoucherSigner(ethers.ZeroAddress))
        .to.be.revertedWith("NodeSale: voucher signer is zero address");
    });
  });

  describe("Local tier cap", function () {
    it("reverts when local tier cap exceeded", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);

      // Tier 9 with cap = 2.
      const tierPrice = 100_000000n;
      await sale.setTierMinPrice(9, tierPrice);
      await sale.setLocalTierCap(9, 2);

      const v1 = makeVoucher({ token: await usdc.getAddress(), tierId: 9n, unitPrice: tierPrice, quantity: 2n });
      const sig1 = await signVoucher(voucherSigner, saleAddress, v1);
      await usdc.connect(buyer).approve(saleAddress, tierPrice * 4n);
      await sale.connect(buyer).purchaseWithVoucher(v1, sig1);

      const v2 = makeVoucher({ token: await usdc.getAddress(), tierId: 9n, unitPrice: tierPrice, quantity: 1n });
      const sig2 = await signVoucher(voucherSigner, saleAddress, v2);
      await expect(sale.connect(buyer).purchaseWithVoucher(v2, sig2))
        .to.be.revertedWith("NodeSale: local tier cap");
    });

    it("admin mint does not consume local tier cap", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      // Tier 0 has localTierCap=100, adminCap=50.
      await sale.adminMint(other.address, 0, 30);
      expect(await sale.localTierSold(0)).to.equal(0);
      expect(await sale.adminMinted(0)).to.equal(30);
    });
  });

  describe("Min price floor", function () {
    it("reverts when voucher unitPrice is below tierMinPrice", async function () {
      const { buyer, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), unitPrice: tierPrice - 1n });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: price below min");
    });

    it("accepts voucher unitPrice exactly at tierMinPrice", async function () {
      const { buyer, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), unitPrice: tierPrice });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(buyer).approve(saleAddress, tierPrice);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);
    });

    it("accepts voucher unitPrice above tierMinPrice (signer can quote higher)", async function () {
      const { buyer, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const higher = tierPrice + 100n;
      const v = makeVoucher({ token: await usdc.getAddress(), unitPrice: higher });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(buyer).approve(saleAddress, higher);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);
    });
  });

  describe("Quantity guards", function () {
    it("reverts on quantity == 0", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), quantity: 0n });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: invalid quantity");
    });

    it("reverts on quantity > MAX_BATCH_SIZE", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress(), quantity: 101n });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: invalid quantity");
    });
  });

  describe("Pause", function () {
    it("reverts purchase when paused", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      await sale.pause();
      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWithCustomError(sale, "EnforcedPause");
    });

    it("allows purchase after unpause", async function () {
      const { buyer, voucherSigner, usdc, nodeContract, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      await sale.pause();
      await sale.unpause();
      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(buyer).approve(saleAddress, tierPrice);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);
      expect(await nodeContract.balanceOf(buyer.address)).to.equal(1);
    });
  });

  describe("Token gating", function () {
    it("reverts on non-accepted token", async function () {
      const { buyer, voucherSigner, badToken, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await badToken.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("NodeSale: token not accepted");
    });

    it("reverts on insufficient buyer balance", async function () {
      const { other, voucherSigner, usdc, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      // `other` has 0 USDC.
      const v = makeVoucher({ buyer: other.address, token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(other).approve(saleAddress, tierPrice);
      await expect(sale.connect(other).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("ERC20: insufficient balance");
    });

    it("reverts on insufficient allowance", async function () {
      const { buyer, voucherSigner, usdc, sale, saleAddress, makeVoucher } = await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      // No approve call.
      await expect(sale.connect(buyer).purchaseWithVoucher(v, sig))
        .to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  describe("Smart contract wallet support (ERC-4337 / Safe)", function () {
    it("a contract wallet can purchase via voucher", async function () {
      const { voucherSigner, usdc, nodeContract, sale, tierPrice, saleAddress } = await loadFixture(deployFixture);

      const MockPurchaser = await ethers.getContractFactory("MockPurchaser");
      const purchaser = await MockPurchaser.deploy();
      await purchaser.waitForDeployment();
      const purchaserAddr = await purchaser.getAddress();

      await usdc.mint(purchaserAddr, tierPrice);

      const chainId = (await ethers.provider.getNetwork()).chainId;
      const v: Voucher = {
        buyer: purchaserAddr,
        chainId,
        saleContract: saleAddress,
        tierId: 0n,
        quantity: 1n,
        token: await usdc.getAddress(),
        unitPrice: tierPrice,
        discountBps: 0,
        codeHash: ethers.ZeroHash,
        reservationId: randomReservationId(),
        deadline: futureDeadline(),
      };
      const sig = await signVoucher(voucherSigner, saleAddress, v);

      await purchaser.tryPurchase(saleAddress, v, sig, tierPrice);

      expect(await nodeContract.balanceOf(purchaserAddr)).to.equal(1);
    });
  });

  describe("AdminMint", function () {
    it("owner can adminMint up to adminCap", async function () {
      const { other, nodeContract, sale } = await loadFixture(deployFixture);
      // Tier 0 adminCap=50.
      await sale.adminMint(other.address, 0, 30);
      expect(await nodeContract.balanceOf(other.address)).to.equal(30);
      expect(await sale.adminMinted(0)).to.equal(30);
    });

    it("rejects adminMint beyond adminCap", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.adminMint(other.address, 0, 51))
        .to.be.revertedWith("NodeSale: admin allocation exceeded");
    });

    it("only owner can adminMint", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).adminMint(other.address, 0, 1))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("rejects adminMint to zero", async function () {
      const { sale } = await loadFixture(deployFixture);
      await expect(sale.adminMint(ethers.ZeroAddress, 0, 1))
        .to.be.revertedWith("NodeSale: zero address");
    });

    it("rejects adminMint with quantity 0", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.adminMint(other.address, 0, 0))
        .to.be.revertedWith("NodeSale: quantity must be > 0");
    });

    it("rejects adminMint outside the 40-tier curve", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.adminMint(other.address, 40, 1))
        .to.be.revertedWith("NodeSale: tier out of range");
    });

    it("emits AdminMint with running totals", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.adminMint(other.address, 0, 2))
        .to.emit(sale, "AdminMint")
        .withArgs(other.address, 0, 2, 2, 50);
    });

    it("works for tiers without a public cap (admin-only tier)", async function () {
      const { other, nodeContract, sale } = await loadFixture(deployFixture);
      // Tier 11 with no localTierCap, but adminCap > 0.
      await sale.setAdminCap(11, 5);
      await sale.adminMint(other.address, 11, 3);
      expect(await nodeContract.balanceOf(other.address)).to.equal(3);
    });
  });

  describe("Owner-only configuration", function () {
    it("only owner can setTierMinPrice", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).setTierMinPrice(0, 100))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("only owner can setLocalTierCap", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).setLocalTierCap(0, 100))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("only owner can setAdminCap", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).setAdminCap(0, 100))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("owner config rejects tier ids outside the 40-tier curve", async function () {
      const { sale } = await loadFixture(deployFixture);
      await expect(sale.setTierMinPrice(40, 100))
        .to.be.revertedWith("NodeSale: tier out of range");
      await expect(sale.setLocalTierCap(40, 100))
        .to.be.revertedWith("NodeSale: tier out of range");
      await expect(sale.setAdminCap(40, 100))
        .to.be.revertedWith("NodeSale: tier out of range");
    });

    it("only owner can pause", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).pause())
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("only owner can setTreasury", async function () {
      const { other, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).setTreasury(other.address))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("only owner can withdrawFunds", async function () {
      const { other, sale, usdc } = await loadFixture(deployFixture);
      await expect(sale.connect(other).withdrawFunds(await usdc.getAddress(), other.address))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    // R8 ship-readiness: access-control tests for setNodeContract +
    // setAcceptedToken. Pass 5 deletion-test would not have caught a
    // dropped `onlyOwner` modifier on these without these tests; the
    // other owner-only functions all had explicit coverage already.
    it("only owner can setNodeContract", async function () {
      const { other, nodeContract, sale } = await loadFixture(deployFixture);
      await expect(sale.connect(other).setNodeContract(await nodeContract.getAddress()))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("only owner can setAcceptedToken", async function () {
      const { other, sale, usdc } = await loadFixture(deployFixture);
      await expect(sale.connect(other).setAcceptedToken(await usdc.getAddress(), false))
        .to.be.revertedWithCustomError(sale, "OwnableUnauthorizedAccount");
    });

    it("setNodeContract rejects zero address", async function () {
      const { sale } = await loadFixture(deployFixture);
      await expect(sale.setNodeContract(ethers.ZeroAddress))
        .to.be.revertedWith("NodeSale: node contract is zero address");
    });

    it("setTreasury rejects zero address", async function () {
      const { sale } = await loadFixture(deployFixture);
      await expect(sale.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("NodeSale: treasury is zero address");
    });
  });

  describe("Withdraw stuck funds", function () {
    it("owner can sweep tokens stuck on the sale contract", async function () {
      const { other, usdc, sale } = await loadFixture(deployFixture);
      await usdc.mint(await sale.getAddress(), 1000n);
      await sale.withdrawFunds(await usdc.getAddress(), other.address);
      expect(await usdc.balanceOf(other.address)).to.equal(1000n);
    });

    it("withdraw rejects zero recipient", async function () {
      const { sale, usdc } = await loadFixture(deployFixture);
      await expect(sale.withdrawFunds(await usdc.getAddress(), ethers.ZeroAddress))
        .to.be.revertedWith("NodeSale: recipient is zero address");
    });

    it("withdraw reverts when balance is zero", async function () {
      const { other, sale, usdc } = await loadFixture(deployFixture);
      await expect(sale.withdrawFunds(await usdc.getAddress(), other.address))
        .to.be.revertedWith("NodeSale: no funds to withdraw");
    });
  });

  describe("Transfer lock (OperonNode)", function () {
    it("blocks transfers while lock is active", async function () {
      const { buyer, other, voucherSigner, usdc, nodeContract, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(buyer).approve(saleAddress, tierPrice);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);

      const futureTime = (await time.latest()) + 365 * 24 * 3600;
      await nodeContract.setTransferLockExpiry(futureTime);

      await expect(nodeContract.connect(buyer).transferFrom(buyer.address, other.address, 1))
        .to.be.revertedWith("OperonNode: transfers are locked");
    });

    it("allows transfers after lock expires", async function () {
      const { buyer, other, voucherSigner, usdc, nodeContract, sale, tierPrice, saleAddress, makeVoucher } =
        await loadFixture(deployFixture);
      const v = makeVoucher({ token: await usdc.getAddress() });
      const sig = await signVoucher(voucherSigner, saleAddress, v);
      await usdc.connect(buyer).approve(saleAddress, tierPrice);
      await sale.connect(buyer).purchaseWithVoucher(v, sig);

      const lockTime = (await time.latest()) + 3600;
      await nodeContract.setTransferLockExpiry(lockTime);
      await time.increaseTo(lockTime + 1);
      await nodeContract.connect(buyer).transferFrom(buyer.address, other.address, 1);
      expect(await nodeContract.ownerOf(1)).to.equal(other.address);
    });
  });

  describe("OperonNode getNodeInfo", function () {
    it("reverts for non-existent token", async function () {
      const { nodeContract } = await loadFixture(deployFixture);
      await expect(nodeContract.getNodeInfo(999)).to.be.revertedWith("OperonNode: token does not exist");
    });
  });
});
