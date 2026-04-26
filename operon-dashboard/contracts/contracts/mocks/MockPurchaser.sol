// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../NodeSale.sol";
import "../interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev A contract that calls NodeSale.purchaseWithVoucher — simulates a
///      smart contract wallet (Gnosis Safe, ERC-4337 account) that implements
///      IERC721Receiver. v2: voucher checkout, no more raw purchase().
contract MockPurchaser is IERC721Receiver {
    function tryPurchase(
        address sale,
        NodeSale.PurchaseVoucher calldata voucher,
        bytes calldata signature,
        uint256 approveAmount
    ) external {
        IERC20(voucher.token).approve(sale, approveAmount);
        NodeSale(sale).purchaseWithVoucher(voucher, signature);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
