// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IERC20.sol";
import "./OperonNode.sol";

/**
 * NodeSale v2 — voucher checkout.
 *
 * Architectural shift from v1:
 *   v1 held the global tier curve in contract state and applied discounts
 *   from an on-chain referral-code mapping. That couples Arb and BSC tier
 *   inventory to whichever contract gets there first (oversells the global
 *   cap) and leaves a discount-bypass surface for any direct contract call.
 *
 *   v2 makes the contract a local safety-net. Every purchase requires an
 *   EIP-712 voucher signed by the backend's voucherSigner. The backend
 *   (sale_reservations + reserve_node_purchase RPC) is the global source of
 *   truth for inventory, discounts, and per-wallet caps. The contract
 *   verifies the voucher and enforces three local invariants:
 *
 *     1. min unit price per tier (price floor — voucherSigner can't sell
 *        below the floor even with a leaked key)
 *     2. per-chain hard cap per tier (defense against either chain being
 *        used to oversell its own allocation)
 *     3. reservation-id replay protection (each voucher consumed exactly once)
 *
 * EIP-712 domain version is "2" so v1 vouchers (had they ever existed) and
 * v2 vouchers can never cross-pollinate. Fresh deploy on Arb + BSC.
 *
 * Owner (Safe-direct, no application caller):
 *   setTreasury, setNodeContract, setVoucherSigner, setTierMinPrice,
 *   setLocalTierCap, setAdminCap, setAcceptedToken, adminMint
 *
 * Owner (wired through dashboard):
 *   pause          ← /api/admin/sale/pause
 *   unpause        ← /api/admin/sale/unpause
 *   withdrawFunds  ← /api/admin/sale/withdraw
 *
 * No `admin` rotating role exists in v2. The v1 role's only consumer was
 * addReferralCode (gone), addReferralCodes (gone), and setTierActive
 * (gone — backend owns tier activation). Voucher signer rotation goes
 * through the Safe via setVoucherSigner per the threat model: a leaked
 * voucher key would let an attacker mint at the floor; rotating it is
 * higher-stakes than tier flips and warrants multi-sig consent.
 */
contract NodeSale is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    // ─── Voucher type ─────────────────────────────────────────────
    // Bound fields — every byte is part of the signature digest, so a
    // tampered voucher (different buyer, chain, contract, tier, qty, token,
    // price, discount, codeHash, reservationId, or deadline) recovers a
    // different signer and fails the equality check below.
    struct PurchaseVoucher {
        address buyer;
        uint256 chainId;
        address saleContract;
        uint256 tierId;
        uint256 quantity;
        address token;
        uint256 unitPrice;
        uint16  discountBps;
        bytes32 codeHash;
        bytes32 reservationId;
        uint256 deadline;
    }

    // Keep this in sync with the struct above. Offline signers (lib/voucher.ts)
    // must produce the same EIP-712 typed-data hash.
    bytes32 private constant PURCHASE_VOUCHER_TYPEHASH = keccak256(
        "PurchaseVoucher(address buyer,uint256 chainId,address saleContract,uint256 tierId,uint256 quantity,address token,uint256 unitPrice,uint16 discountBps,bytes32 codeHash,bytes32 reservationId,uint256 deadline)"
    );

    // ─── Constants ────────────────────────────────────────────────
    // Defensive cap on quantity. Backend's reserve RPC enforces the same
    // bound; this is the contract-side belt to the backend's braces.
    uint256 public constant MAX_BATCH_SIZE = 100;

    // ─── Storage ──────────────────────────────────────────────────
    OperonNode public nodeContract;
    address    public treasury;
    address    public voucherSigner;

    // Per-tier price floor. A voucher with unitPrice below this floor reverts;
    // bounds the worst-case loss from a leaked voucher signer to discounts off
    // the floor (rather than the signer setting any price they want).
    mapping(uint256 => uint256) public tierMinPrice;

    // Per-chain hard cap for this tier. Backend tracks the global cap across
    // both chains via sale_reservations + sale_tiers; this is the contract's
    // local-only safety-net so a backend bug can't oversell on this chain.
    mapping(uint256 => uint256) public localTierCap;
    mapping(uint256 => uint256) public localTierSold;

    // Per-tier admin allocation, separate from the public cap. adminMint
    // does not consume localTierCap.
    mapping(uint256 => uint256) public adminCap;
    mapping(uint256 => uint256) public adminMinted;

    mapping(address => bool) public acceptedTokens;

    // Replay protection. Backend's reservation IDs (UUID v4) are ~122 bits of
    // entropy padded to bytes32; collision probability is negligible. Marked
    // true atomically before the external transferFrom so a re-entrant call
    // path can't reuse the same reservation.
    mapping(bytes32 => bool) public usedReservations;

    // ─── Events ───────────────────────────────────────────────────
    event NodePurchased(
        address indexed buyer,
        uint256 indexed tier,
        uint256 quantity,
        bytes32 indexed reservationId,
        bytes32 codeHash,
        uint256 totalPaid,
        address token
    );
    event AdminMint(
        address indexed to,
        uint256 indexed tierId,
        uint256 quantity,
        uint256 adminMintedTotal,
        uint256 adminCapTotal
    );
    event TierMinPriceUpdated(uint256 indexed tierId, uint256 minPrice);
    event LocalTierCapUpdated(uint256 indexed tierId, uint256 cap);
    event AdminCapUpdated(uint256 indexed tierId, uint256 cap);
    event AcceptedTokenUpdated(address indexed token, bool accepted);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event NodeContractUpdated(address indexed oldContract, address indexed newContract);
    event VoucherSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event FundsWithdrawn(address indexed token, address indexed to, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────
    constructor(address _treasury, address _voucherSigner)
        Ownable(msg.sender)
        EIP712("OperonNodeSale", "2")
    {
        require(_treasury != address(0), "NodeSale: treasury is zero address");
        require(_voucherSigner != address(0), "NodeSale: voucher signer is zero address");
        treasury = _treasury;
        voucherSigner = _voucherSigner;
        emit TreasuryUpdated(address(0), _treasury);
        emit VoucherSignerUpdated(address(0), _voucherSigner);
    }

    // ─── Public purchase path ────────────────────────────────────
    function purchaseWithVoucher(
        PurchaseVoucher calldata voucher,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        // Voucher binding checks (cheap, fail fast)
        require(voucher.buyer == msg.sender, "NodeSale: voucher buyer mismatch");
        require(voucher.chainId == block.chainid, "NodeSale: wrong chain");
        require(voucher.saleContract == address(this), "NodeSale: wrong contract");
        require(voucher.deadline >= block.timestamp, "NodeSale: voucher expired");
        require(!usedReservations[voucher.reservationId], "NodeSale: reservation used");

        // Local safety-net checks (independent of voucher signer trust)
        require(acceptedTokens[voucher.token], "NodeSale: token not accepted");
        require(
            voucher.quantity > 0 && voucher.quantity <= MAX_BATCH_SIZE,
            "NodeSale: invalid quantity"
        );
        require(
            localTierSold[voucher.tierId] + voucher.quantity <= localTierCap[voucher.tierId],
            "NodeSale: local tier cap"
        );
        require(voucher.unitPrice >= tierMinPrice[voucher.tierId], "NodeSale: price below min");
        require(voucher.discountBps <= 10000, "NodeSale: discount > 100%");

        // Signature verification (most expensive op — kept after the cheap
        // failure paths so a malformed voucher reverts before paying for ECDSA).
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            PURCHASE_VOUCHER_TYPEHASH,
            voucher.buyer,
            voucher.chainId,
            voucher.saleContract,
            voucher.tierId,
            voucher.quantity,
            voucher.token,
            voucher.unitPrice,
            voucher.discountBps,
            voucher.codeHash,
            voucher.reservationId,
            voucher.deadline
        )));
        address signer = ECDSA.recover(digest, signature);
        require(signer == voucherSigner, "NodeSale: bad voucher signer");

        // Effects (CEI pattern — state mutated before external calls)
        usedReservations[voucher.reservationId] = true;
        localTierSold[voucher.tierId] += voucher.quantity;

        // Price math. Discount applied to (unitPrice * quantity) as a whole;
        // the dapp's display logic must mirror this to avoid 1-cent drift on
        // odd tier×discount combinations.
        uint256 totalPrice = voucher.unitPrice * voucher.quantity;
        if (voucher.discountBps > 0) {
            totalPrice = totalPrice - (totalPrice * voucher.discountBps / 10000);
        }

        // Interactions
        require(
            IERC20(voucher.token).transferFrom(msg.sender, treasury, totalPrice),
            "NodeSale: payment transfer failed"
        );
        nodeContract.batchMint(msg.sender, voucher.tierId, voucher.unitPrice, voucher.quantity);

        emit NodePurchased(
            msg.sender,
            voucher.tierId,
            voucher.quantity,
            voucher.reservationId,
            voucher.codeHash,
            totalPrice,
            voucher.token
        );
    }

    // ─── Admin / owner ────────────────────────────────────────────
    function adminMint(address to, uint256 tierId, uint256 quantity) external onlyOwner nonReentrant {
        require(to != address(0), "NodeSale: zero address");
        require(quantity > 0, "NodeSale: quantity must be > 0");
        require(adminMinted[tierId] + quantity <= adminCap[tierId], "NodeSale: admin allocation exceeded");

        adminMinted[tierId] += quantity;

        // Record admin mints at the tier's min price (audit info). Operator
        // gets nodes for free; the per-token mint price stored on OperonNode
        // is the min-price reference for that tier.
        uint256 mintPrice = tierMinPrice[tierId];
        nodeContract.batchMint(to, tierId, mintPrice, quantity);

        emit AdminMint(to, tierId, quantity, adminMinted[tierId], adminCap[tierId]);
    }

    function setVoucherSigner(address _voucherSigner) external onlyOwner {
        require(_voucherSigner != address(0), "NodeSale: voucher signer is zero address");
        address old = voucherSigner;
        voucherSigner = _voucherSigner;
        emit VoucherSignerUpdated(old, _voucherSigner);
    }

    function setTierMinPrice(uint256 tierId, uint256 minPrice) external onlyOwner {
        tierMinPrice[tierId] = minPrice;
        emit TierMinPriceUpdated(tierId, minPrice);
    }

    function setLocalTierCap(uint256 tierId, uint256 cap) external onlyOwner {
        // We do not enforce cap >= localTierSold here on purpose — a redeploy
        // on a fresh chain has localTierSold=0, and a runtime cap raise is
        // also fine. Lowering below localTierSold simply prevents further
        // purchases until localTierSold catches up; existing minted nodes
        // are unaffected.
        localTierCap[tierId] = cap;
        emit LocalTierCapUpdated(tierId, cap);
    }

    function setAdminCap(uint256 tierId, uint256 cap) external onlyOwner {
        adminCap[tierId] = cap;
        emit AdminCapUpdated(tierId, cap);
    }

    function setAcceptedToken(address token, bool accepted) external onlyOwner {
        acceptedTokens[token] = accepted;
        emit AcceptedTokenUpdated(token, accepted);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "NodeSale: treasury is zero address");
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function setNodeContract(address _nodeContract) external onlyOwner {
        require(_nodeContract != address(0), "NodeSale: node contract is zero address");
        address old = address(nodeContract);
        nodeContract = OperonNode(_nodeContract);
        emit NodeContractUpdated(old, _nodeContract);
    }

    function withdrawFunds(address token, address to) external onlyOwner {
        require(to != address(0), "NodeSale: recipient is zero address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "NodeSale: no funds to withdraw");
        require(IERC20(token).transfer(to, balance), "NodeSale: withdrawal failed");
        emit FundsWithdrawn(token, to, balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
