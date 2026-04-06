// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../NodeSale.sol";
import "../interfaces/IERC20.sol";

/// @dev A contract that tries to call NodeSale.purchase — used to test EOA-only guard.
contract MockPurchaser {
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
}
