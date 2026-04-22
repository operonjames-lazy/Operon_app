// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract OperonNode is ERC721Enumerable, Ownable2Step, Pausable {
    // --- Storage ---
    mapping(uint256 => uint256) public tokenTier;
    mapping(uint256 => uint256) public purchasePrice;
    mapping(uint256 => uint256) public purchaseDate;

    uint256 public nextTokenId = 1;
    address public minter;
    uint256 public transferLockExpiry;

    // --- Events ---
    event NodeMinted(address indexed to, uint256 indexed tokenId, uint256 tier, uint256 price);
    event MinterUpdated(address indexed oldMinter, address indexed newMinter);
    event TransferLockExpiryUpdated(uint256 oldExpiry, uint256 newExpiry);

    // --- Modifiers ---
    modifier onlyMinter() {
        require(msg.sender == minter, "OperonNode: caller is not the minter");
        _;
    }

    // --- Constructor ---
    constructor() ERC721("Operon Node", "OPNODE") Ownable(msg.sender) {}

    // --- Admin Functions ---
    function setMinter(address _minter) external onlyOwner {
        address old = minter;
        minter = _minter;
        emit MinterUpdated(old, _minter);
    }

    function setTransferLockExpiry(uint256 _expiry) external onlyOwner {
        uint256 old = transferLockExpiry;
        transferLockExpiry = _expiry;
        emit TransferLockExpiryUpdated(old, _expiry);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // --- Minting ---
    function mint(address to, uint256 tier, uint256 price) external onlyMinter whenNotPaused returns (uint256) {
        uint256 tokenId = nextTokenId++;
        tokenTier[tokenId] = tier;
        purchasePrice[tokenId] = price;
        purchaseDate[tokenId] = block.timestamp;

        _safeMint(to, tokenId);

        emit NodeMinted(to, tokenId, tier, price);
        return tokenId;
    }

    function batchMint(address to, uint256 tier, uint256 price, uint256 quantity) external onlyMinter whenNotPaused {
        require(quantity > 0, "OperonNode: quantity must be > 0");
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId++;
            tokenTier[tokenId] = tier;
            purchasePrice[tokenId] = price;
            purchaseDate[tokenId] = block.timestamp;

            _safeMint(to, tokenId);

            emit NodeMinted(to, tokenId, tier, price);
        }
    }

    // --- View Functions ---
    function getNodeInfo(uint256 tokenId) external view returns (uint256 tier, uint256 price, uint256 date) {
        require(_ownerOf(tokenId) != address(0), "OperonNode: token does not exist");
        return (tokenTier[tokenId], purchasePrice[tokenId], purchaseDate[tokenId]);
    }

    // --- Transfer Hook ---
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0)) and burning (to == address(0))
        // Block transfers during lock period
        if (from != address(0) && to != address(0)) {
            require(block.timestamp >= transferLockExpiry, "OperonNode: transfers are locked");
        }

        return super._update(to, tokenId, auth);
    }

    // --- Required Overrides ---
    function _increaseBalance(address account, uint128 amount) internal override(ERC721Enumerable) {
        super._increaseBalance(account, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
