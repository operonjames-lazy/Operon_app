// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../NodeSale.sol";
import "../interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev A contract that calls NodeSale.purchase — simulates a smart contract
///      wallet (Gnosis Safe, ERC-4337 account) that implements IERC721Receiver.
contract MockPurchaser is IERC721Receiver {
    function tryPurchase(
        address sale,
        uint256 tierId,
        uint256 quantity,
        address token,
        bytes32 codeHash,
        uint256 deadline,
        uint256 maxPricePerNode,
        uint256 approveAmount
    ) external {
        IERC20(token).approve(sale, approveAmount);
        NodeSale(sale).purchase(tierId, quantity, token, codeHash, deadline, maxPricePerNode);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
