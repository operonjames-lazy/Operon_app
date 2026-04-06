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
        uint256 supply;
        uint256 sold;
        bool active;
    }

    // --- State ---
    OperonNode public nodeContract;
    address public treasury;

    mapping(uint256 => Tier) public tiers;
    mapping(bytes32 => bool) public validCodes;
    mapping(bytes32 => uint16) public codeDiscountBps;
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
    event TierUpdated(uint256 indexed tierId, uint256 price, uint256 supply, bool active);
    event TierPausedToggled(uint256 indexed tierId, bool paused);
    event TierActiveUpdated(uint256 indexed tierId, bool active);
    event MaxPerWalletUpdated(uint256 indexed tierId, uint256 max);
    event ReferralCodeAdded(bytes32 indexed codeHash, uint16 discountBps);
    event AcceptedTokenUpdated(address indexed token, bool accepted);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event NodeContractUpdated(address indexed oldContract, address indexed newContract);
    event FundsWithdrawn(address indexed token, address indexed to, uint256 amount);

    // --- Constructor ---
    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "NodeSale: treasury is zero address");
        treasury = _treasury;
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
        require(msg.sender == tx.origin, "NodeSale: no contract purchases");
        require(quantity > 0 && quantity <= maxBatchSize, "NodeSale: invalid quantity");
        require(acceptedTokens[token], "NodeSale: token not accepted");
        require(!tierPaused[tierId], "NodeSale: tier paused");

        Tier storage tier = tiers[tierId];
        require(tier.active, "NodeSale: tier not active");
        require(tier.sold + quantity <= tier.supply, "NodeSale: tier sold out");

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
            uint16 discount = codeDiscountBps[codeHash];
            if (discount == 0) {
                discount = defaultDiscountBps;
            }
            totalPrice = totalPrice - (totalPrice * discount / 10000);
        }

        // Transfer payment to treasury
        require(
            IERC20(token).transferFrom(msg.sender, treasury, totalPrice),
            "NodeSale: payment transfer failed"
        );

        // Update state (CEI: state changes before external call)
        tier.sold += quantity;
        purchaseCount[msg.sender][tierId] += quantity;

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
    function setTier(uint256 tierId, uint256 price, uint256 supply, bool active) external onlyOwner {
        tiers[tierId] = Tier({
            price: price,
            supply: supply,
            sold: tiers[tierId].sold, // preserve sold count
            active: active
        });
        emit TierUpdated(tierId, price, supply, active);
    }

    function setTierActive(uint256 tierId, bool active) external onlyOwner {
        tiers[tierId].active = active;
        emit TierActiveUpdated(tierId, active);
    }

    function setMaxPerWallet(uint256 tierId, uint256 max) external onlyOwner {
        maxPerWallet[tierId] = max;
        emit MaxPerWalletUpdated(tierId, max);
    }

    function addReferralCode(bytes32 codeHash, uint16 discountBps) external onlyOwner {
        validCodes[codeHash] = true;
        codeDiscountBps[codeHash] = discountBps;
        emit ReferralCodeAdded(codeHash, discountBps);
    }

    function addReferralCodes(bytes32[] calldata codeHashes, uint16 discountBps) external onlyOwner {
        for (uint256 i = 0; i < codeHashes.length; i++) {
            validCodes[codeHashes[i]] = true;
            codeDiscountBps[codeHashes[i]] = discountBps;
            emit ReferralCodeAdded(codeHashes[i], discountBps);
        }
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
        maxBatchSize = _maxBatchSize;
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
