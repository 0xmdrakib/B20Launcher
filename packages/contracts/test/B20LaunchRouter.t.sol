// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {B20LaunchRouter} from "../src/B20LaunchRouter.sol";

contract B20LaunchRouterTest is Test {
    B20LaunchRouter internal router;

    function setUp() public {
        router = new B20LaunchRouter();
    }

    function testRejectsEmptyName() public {
        B20LaunchRouter.AssetLaunch memory launch;
        launch.common.symbol = "TST";
        launch.common.admin = address(this);
        launch.common.contractURI = "ipfs://metadata";
        launch.decimals = 18;

        vm.expectRevert(B20LaunchRouter.EmptyName.selector);
        router.launchAsset(launch);
    }

    function testRejectsEmptyStablecoinCurrency() public {
        B20LaunchRouter.StablecoinLaunch memory launch;
        launch.common.name = "Dollar";
        launch.common.symbol = "USD";
        launch.common.admin = address(this);
        launch.common.contractURI = "ipfs://metadata";

        vm.expectRevert(B20LaunchRouter.EmptyCurrency.selector);
        router.launchStablecoin(launch);
    }
}
