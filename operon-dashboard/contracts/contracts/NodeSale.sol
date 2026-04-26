// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20.sol";
import "./OperonNode.sol";

contract NodeSale is Ownable2Step, Pausable, ReentrancyGuard {
    // --- Structs ---
    struct Tier {
        uint256 price;
        uint256 publicSupply;
        uint256 adminSupply;
        uint256 publicSold;
        uint256 adminSold;
        bool active;
    }

    // --- State ---
    OperonNode public nodeContract;
    address public treasury;

    // Hot-path operational role. `owner` (cold, Safe) is retained via
    // Ownable2Step for treasury/price/ownership-handover; `admin` holds
    // the frequently-called functions that cannot wait on multi-sig —
    // referral code registration and per-tier active flips. Initialised
    // to the deployer in the constructor so deploy.ts does not need a
    // second tx. `setAdmin` lets owner rotate the key or zero it out.
    address public admin;

    mapping(uint256 => Tier) public tiers;
    mapping(bytes32 => bool) public validCodes;
    mapping(bytes32 => uint16) public codeDiscountBps;
    // Per-code owner wallet, set at registration. Used by `purchase()` to
    // reject same-wallet self-referral on-chain. Zero address means the code
    // has no owner binding (legacy codes registered before this mapping
    // existed); such codes are still valid but cannot be self-referral-checked.
    // New deploys populate this for every registered code.
    mapping(bytes32 => address) public codeOwner;
    mapping(address => mapping(uint256 => uint256)) public purchaseCount;
    mapping(uint256 => uint256) public maxPerWallet;
    mapping(address => bool) public acceptedTokens;

    uint16 public defaultDiscountBps = 1500; // 15%
    uint256 public maxBatchSize = 100;
    mapping(uint256 => bool) public tierPaused;

    // --- Events ---
    event NodePurchased(
        address indexed buyer,
        uint256 tier,
        uint256 quantity,
        bytes32 codeHash,
        uint256 totalPaid,
        address token
    );
    event AdminMint(address indexed to, uint256 indexed tierId, uint256 quantity, uint256 adminSold, uint256 adminSupply);
    event TierUpdated(uint256 indexed tierId, uint256 price, uint256 publicSupply, uint256 adminSupply, bool active);
    event TierPausedToggled(uint256 indexed tierId, bool paused);
    event TierActiveUpdated(uint256 indexed tierId, bool active);
    event MaxPerWalletUpdated(uint256 indexed tierId, uint256 max);
    event ReferralCodeAdded(bytes32 indexed codeHash, address indexed owner, uint16 discountBps);
    event AcceptedTokenUpdated(address indexed token, bool accepted);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event NodeContractUpdated(address indexed oldContract, address indexed newContract);
    event FundsWithdrawn(address indexed token, address indexed to, uint256 amount);
    event ReferralCodeRemoved(bytes32 indexed codeHash);
    event MaxBatchSizeUpdated(uint256 oldSize, uint256 newSize);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);

    // --- Modifiers ---
    modifier onlyAdmin() {
        require(msg.sender == admin, "NodeSale: caller is not admin");
        _;
    }

    // --- Constructor ---
    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "NodeSale: treasury is zero address");
        treasury = _treasury;
        admin = msg.sender;
        emit AdminUpdated(address(0), msg.sender);
    }

    // --- Purchase ---
    function purchase(
        uint256 tierId,
        uint256 quantity,
        address token,
        bytes32 codeHash,
        uint256 deadline,
        uint256 maxPricePerNode
    ) external nonReentrant whenNotPaused {
        require(block.timestamp <= deadline, "NodeSale: tx expired");
        require(tiers[tierId].price <= maxPricePerNode, "NodeSale: price slippage");
        require(quantity > 0 && quantity <= maxBatchSize, "NodeSale: invalid quantity");
        require(acceptedTokens[token], "NodeSale: token not accepted");
        require(!tierPaused[tierId], "NodeSale: tier paused");

        Tier storage tier = tiers[tierId];
        require(tier.active, "NodeSale: tier not active");
        require(tier.publicSold + quantity <= tier.publicSupply, "NodeSale: tier sold out");

        // Check wallet limit
        uint256 walletMax = maxPerWallet[tierId];
        if (walletMax > 0) {
            require(
                purchaseCount[msg.sender][tierId] + quantity <= walletMax,
                "NodeSale: exceeds wallet limit"
            );
        }

        // Calculate price
        uint256 totalPrice = tier.price * quantity;
        if (codeHash != bytes32(0) && validCodes[codeHash]) {
            // Same-wallet self-referral guard. Codes registered after the
            // codeOwner mapping shipped carry the owning wallet; we reject
            // a buyer attempting to discount themselves with their own code.
            // Codes registered before the mapping existed have owner=0 and
            // skip this check (legacy passthrough). The frontend zeroes the
            // codeHash for self-referral as a UX courtesy; this require is
            // the load-bearing defense against a direct contract call.
            address owner_ = codeOwner[codeHash];
            require(owner_ == address(0) || owner_ != msg.sender, "NodeSale: self-referral");
            uint16 discount = codeDiscountBps[codeHash];
            if (discount == 0) {
                discount = defaultDiscountBps;
            }
            totalPrice = totalPrice - (totalPrice * discount / 10000);
        }

        // Update state BEFORE external calls (CEI pattern)
        tier.publicSold += quantity;
        purchaseCount[msg.sender][tierId] += quantity;

        // Transfer payment to treasury
        require(
            IERC20(token).transferFrom(msg.sender, treasury, totalPrice),
            "NodeSale: payment transfer failed"
        );

        // Mint nodes (external call last)
        nodeContract.batchMint(msg.sender, tierId, tier.price, quantity);

        emit NodePurchased(msg.sender, tierId, quantity, codeHash, totalPrice, token);
    }

    // --- View Functions ---
    function validateCode(bytes32 codeHash) external view returns (bool valid, uint16 discountBps) {
        valid = validCodes[codeHash];
        discountBps = codeDiscountBps[codeHash];
        if (valid && discountBps == 0) {
            discountBps = defaultDiscountBps;
        }
    }

    // --- Admin Functions ---
    //
    // Wiring map (R-87 — Pass-5 orphan-inverse):
    //   onlyOwner (Safe-direct, no application caller):
    //     setTier, setMaxPerWallet, setAcceptedToken, setTreasury,
    //     setNodeContract, setMaxBatchSize, setTierPaused, adminMint
    //   onlyOwner (wired through dashboard):
    //     pause            ← /api/admin/sale/pause
    //     unpause          ← /api/admin/sale/unpause
    //     withdrawFunds    ← /api/admin/sale/withdraw
    //     setAdmin         ← Safe-direct, called once during Gnosis Safe handover
    //   onlyAdmin (rotating hot key, wired through dashboard):
    //     setTierActive    ← /api/admin/sale/tier-active
    //     addReferralCode  ← /api/cron/reconcile (referral_code_chain_state drain)
    //     addReferralCodes ← (batch helper; reserved)
    //     removeReferralCode ← /api/admin/referrals/remove
    //
    // Post-Gnosis-Safe novation, the four `pause`/`unpause`/`withdraw`/
    // `setAdmin` paths route through the Safe via Owner2Step `acceptOwnership`.
    // The dashboard hot-key calls for those will revert by design — see
    // OPERATIONS.md §3 "Before mainnet" for the runbook.
    function adminMint(address to, uint256 tierId, uint256 quantity) external onlyOwner nonReentrant {
        require(to != address(0), "NodeSale: zero address");
        require(quantity > 0, "NodeSale: quantity must be > 0");

        Tier storage tier = tiers[tierId];
        require(tier.active || tier.adminSupply > 0, "NodeSale: tier not configured");
        require(tier.adminSold + quantity <= tier.adminSupply, "NodeSale: admin allocation exceeded");

        // Effects before interactions (CEI)
        tier.adminSold += quantity;

        // Mint nodes (no payment required)
        nodeContract.batchMint(to, tierId, tier.price, quantity);

        emit AdminMint(to, tierId, quantity, tier.adminSold, tier.adminSupply);
    }

    function setTier(uint256 tierId, uint256 price, uint256 publicSupply, uint256 adminSupply, bool active) external onlyOwner {
        Tier storage tier = tiers[tierId];
        // Preserve sold counts
        uint256 prevPublicSold = tier.publicSold;
        uint256 prevAdminSold = tier.adminSold;
        tier.price = price;
        tier.publicSupply = publicSupply;
        tier.adminSupply = adminSupply;
        tier.publicSold = prevPublicSold;
        tier.adminSold = prevAdminSold;
        tier.active = active;
        emit TierUpdated(tierId, price, publicSupply, adminSupply, active);
    }

    function setTierActive(uint256 tierId, bool active) external onlyAdmin {
        tiers[tierId].active = active;
        emit TierActiveUpdated(tierId, active);
    }

    function setMaxPerWallet(uint256 tierId, uint256 max) external onlyOwner {
        maxPerWallet[tierId] = max;
        emit MaxPerWalletUpdated(tierId, max);
    }

    function addReferralCode(bytes32 codeHash, address owner, uint16 discountBps) external onlyAdmin {
        // Cap at 100%. `uint16` goes to 65535 and the purchase path uses
        // `totalPrice - (totalPrice * discount / 10000)`, which underflows
        // (and reverts in 0.8.x) above 10000 — so the tx would fail loudly
        // at purchase time. Rejecting here keeps the failure mode upstream:
        // a leaked admin key can't stealth-register a 100%-off code and
        // force every subsequent purchase to revert on buyers.
        require(discountBps <= 10000, "NodeSale: discount > 100%");
        validCodes[codeHash] = true;
        codeDiscountBps[codeHash] = discountBps;
        // owner=0 is permitted (no self-referral binding) but discouraged —
        // the off-chain sync always passes the real wallet. A zero owner
        // means the code passes through the self-referral check unconditionally.
        codeOwner[codeHash] = owner;
        emit ReferralCodeAdded(codeHash, owner, discountBps);
    }

    function removeReferralCode(bytes32 codeHash) external onlyAdmin {
        validCodes[codeHash] = false;
        codeDiscountBps[codeHash] = 0;
        codeOwner[codeHash] = address(0);
        emit ReferralCodeRemoved(codeHash);
    }

    function addReferralCodes(
        bytes32[] calldata codeHashes,
        address[] calldata owners,
        uint16 discountBps
    ) external onlyAdmin {
        require(discountBps <= 10000, "NodeSale: discount > 100%");
        require(codeHashes.length == owners.length, "NodeSale: length mismatch");
        for (uint256 i = 0; i < codeHashes.length; i++) {
            validCodes[codeHashes[i]] = true;
            codeDiscountBps[codeHashes[i]] = discountBps;
            codeOwner[codeHashes[i]] = owners[i];
            emit ReferralCodeAdded(codeHashes[i], owners[i], discountBps);
        }
    }

    function setAdmin(address _admin) external onlyOwner {
        address old = admin;
        admin = _admin;
        emit AdminUpdated(old, _admin);
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

    function setMaxBatchSize(uint256 _maxBatchSize) external onlyOwner {
        uint256 old = maxBatchSize;
        maxBatchSize = _maxBatchSize;
        emit MaxBatchSizeUpdated(old, _maxBatchSize);
    }

    function setTierPaused(uint256 tierId, bool _paused) external onlyOwner {
        tierPaused[tierId] = _paused;
        emit TierPausedToggled(tierId, _paused);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
