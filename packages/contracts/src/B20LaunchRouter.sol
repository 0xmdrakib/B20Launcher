// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IB20Factory {
    enum B20Variant {
        ASSET,
        STABLECOIN
    }

    struct B20AssetCreateParams {
        uint8 version;
        string name;
        string symbol;
        address initialAdmin;
        uint8 decimals;
    }

    struct B20StablecoinCreateParams {
        uint8 version;
        string name;
        string symbol;
        address initialAdmin;
        string currency;
    }

    function createB20(
        B20Variant variant,
        bytes32 salt,
        bytes calldata params,
        bytes[] calldata initCalls
    ) external payable returns (address token);
}

interface IB20Bootstrap {
    function updateContractURI(string calldata newURI) external;
    function updateSupplyCap(uint256 newSupplyCap) external;
    function grantRole(bytes32 role, address account) external;
    function updatePolicy(bytes32 policyScope, uint64 newPolicyId) external;
    function pause(uint8[] calldata features) external;
    function mint(address to, uint256 amount) external;
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external;
    function updateExtraMetadata(string calldata key, string calldata value) external;
    function updateMultiplier(uint256 newMultiplier) external;
}

/// @title B20LaunchRouter
/// @notice Fee-free non-custodial router that standardizes B20 launch init-call ordering.
contract B20LaunchRouter {
    uint8 internal constant CREATE_PARAMS_VERSION = 1;
    uint256 internal constant WAD_PRECISION = 1e18;
    IB20Factory internal constant B20_FACTORY =
        IB20Factory(0xB20f000000000000000000000000000000000000);

    struct RoleGrant {
        bytes32 role;
        address account;
    }

    struct Mint {
        address recipient;
        uint256 amount;
    }

    struct Policy {
        bytes32 scope;
        uint64 policyId;
    }

    struct ExtraMetadata {
        string key;
        string value;
    }

    struct LaunchCommon {
        string name;
        string symbol;
        address admin;
        bytes32 salt;
        string contractURI;
        uint256 supplyCap;
        RoleGrant[] roleGrants;
        Mint[] initialMints;
        Policy[] policies;
        uint8[] pauseFeatures;
    }

    struct AssetLaunch {
        LaunchCommon common;
        uint8 decimals;
        ExtraMetadata[] extraMetadata;
        uint256 multiplier;
    }

    struct StablecoinLaunch {
        LaunchCommon common;
        string currency;
    }

    event PlatformB20Launched(
        address indexed issuer,
        address indexed token,
        uint8 indexed variant,
        bytes32 salt,
        string contractURI
    );

    error EmptyName();
    error EmptySymbol();
    error EmptyContractURI();
    error EmptyCurrency();
    error InvalidAddress();

    function launchAsset(AssetLaunch calldata launch) external returns (address token) {
        _validateCommon(launch.common);

        bytes memory params = abi.encode(
            IB20Factory.B20AssetCreateParams({
                version: CREATE_PARAMS_VERSION,
                name: launch.common.name,
                symbol: launch.common.symbol,
                initialAdmin: launch.common.admin,
                decimals: launch.decimals
            })
        );

        token = B20_FACTORY.createB20(
            IB20Factory.B20Variant.ASSET,
            launch.common.salt,
            params,
            _assetInitCalls(launch)
        );

        emit PlatformB20Launched(
            msg.sender,
            token,
            uint8(IB20Factory.B20Variant.ASSET),
            launch.common.salt,
            launch.common.contractURI
        );
    }

    function launchStablecoin(StablecoinLaunch calldata launch) external returns (address token) {
        _validateCommon(launch.common);
        if (bytes(launch.currency).length == 0) revert EmptyCurrency();

        bytes memory params = abi.encode(
            IB20Factory.B20StablecoinCreateParams({
                version: CREATE_PARAMS_VERSION,
                name: launch.common.name,
                symbol: launch.common.symbol,
                initialAdmin: launch.common.admin,
                currency: launch.currency
            })
        );

        token = B20_FACTORY.createB20(
            IB20Factory.B20Variant.STABLECOIN,
            launch.common.salt,
            params,
            _stablecoinInitCalls(launch)
        );

        emit PlatformB20Launched(
            msg.sender,
            token,
            uint8(IB20Factory.B20Variant.STABLECOIN),
            launch.common.salt,
            launch.common.contractURI
        );
    }

    function _validateCommon(LaunchCommon calldata common) internal pure {
        if (bytes(common.name).length == 0) revert EmptyName();
        if (bytes(common.symbol).length == 0) revert EmptySymbol();
        if (bytes(common.contractURI).length == 0) revert EmptyContractURI();
    }

    function _commonInitCallCount(LaunchCommon calldata common) internal pure returns (uint256 count) {
        count = 1; // contractURI is required.
        if (common.supplyCap != 0) count++;
        for (uint256 i; i < common.roleGrants.length; i++) {
            if (common.roleGrants[i].account != address(0)) count++;
        }
        count += common.policies.length;
        if (common.pauseFeatures.length != 0) count++;
    }

    function _writeCommonInitCalls(
        bytes[] memory initCalls,
        LaunchCommon calldata common,
        uint256 i
    ) internal pure returns (uint256) {
        initCalls[i++] = abi.encodeCall(IB20Bootstrap.updateContractURI, (common.contractURI));

        if (common.supplyCap != 0) {
            initCalls[i++] = abi.encodeCall(IB20Bootstrap.updateSupplyCap, (common.supplyCap));
        }

        for (uint256 r; r < common.roleGrants.length; r++) {
            RoleGrant calldata grant = common.roleGrants[r];
            if (grant.account != address(0)) {
                initCalls[i++] = abi.encodeCall(IB20Bootstrap.grantRole, (grant.role, grant.account));
            }
        }

        return i;
    }

    function _writePoliciesAndPause(
        bytes[] memory initCalls,
        LaunchCommon calldata common,
        uint256 i
    ) internal pure returns (uint256) {
        for (uint256 p; p < common.policies.length; p++) {
            initCalls[i++] =
                abi.encodeCall(IB20Bootstrap.updatePolicy, (common.policies[p].scope, common.policies[p].policyId));
        }

        if (common.pauseFeatures.length != 0) {
            initCalls[i++] = abi.encodeCall(IB20Bootstrap.pause, (common.pauseFeatures));
        }

        return i;
    }

    function _assetInitCalls(AssetLaunch calldata launch) internal pure returns (bytes[] memory) {
        uint256 count = _commonInitCallCount(launch.common);
        if (launch.common.initialMints.length != 0) count++;
        count += launch.extraMetadata.length;
        if (launch.multiplier != 0 && launch.multiplier != WAD_PRECISION) count++;

        bytes[] memory initCalls = new bytes[](count);
        uint256 i = _writeCommonInitCalls(initCalls, launch.common, 0);

        for (uint256 m; m < launch.extraMetadata.length; m++) {
            initCalls[i++] = abi.encodeCall(
                IB20Bootstrap.updateExtraMetadata,
                (launch.extraMetadata[m].key, launch.extraMetadata[m].value)
            );
        }

        if (launch.multiplier != 0 && launch.multiplier != WAD_PRECISION) {
            initCalls[i++] = abi.encodeCall(IB20Bootstrap.updateMultiplier, (launch.multiplier));
        }

        if (launch.common.initialMints.length != 0) {
            (address[] memory recipients, uint256[] memory amounts) = _mintArrays(launch.common);
            initCalls[i++] = abi.encodeCall(IB20Bootstrap.batchMint, (recipients, amounts));
        }

        i = _writePoliciesAndPause(initCalls, launch.common, i);
        assert(i == count);
        return initCalls;
    }

    function _stablecoinInitCalls(StablecoinLaunch calldata launch) internal pure returns (bytes[] memory) {
        uint256 count = _commonInitCallCount(launch.common) + launch.common.initialMints.length;
        bytes[] memory initCalls = new bytes[](count);
        uint256 i = _writeCommonInitCalls(initCalls, launch.common, 0);

        for (uint256 m; m < launch.common.initialMints.length; m++) {
            Mint calldata mint = launch.common.initialMints[m];
            if (mint.recipient == address(0)) revert InvalidAddress();
            initCalls[i++] = abi.encodeCall(IB20Bootstrap.mint, (mint.recipient, mint.amount));
        }

        i = _writePoliciesAndPause(initCalls, launch.common, i);
        assert(i == count);
        return initCalls;
    }

    function _mintArrays(LaunchCommon calldata common)
        internal
        pure
        returns (address[] memory recipients, uint256[] memory amounts)
    {
        recipients = new address[](common.initialMints.length);
        amounts = new uint256[](common.initialMints.length);

        for (uint256 i; i < common.initialMints.length; i++) {
            if (common.initialMints[i].recipient == address(0)) revert InvalidAddress();
            recipients[i] = common.initialMints[i].recipient;
            amounts[i] = common.initialMints[i].amount;
        }
    }
}
