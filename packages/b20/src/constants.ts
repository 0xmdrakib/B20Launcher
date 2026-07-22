import { keccak256, toBytes, type Address, type Hex } from "viem";

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const B20_FACTORY_ADDRESS =
  "0xB20f000000000000000000000000000000000000" as Address;
export const ACTIVATION_REGISTRY_ADDRESS =
  "0x8453000000000000000000000000000000000001" as Address;
export const POLICY_REGISTRY_ADDRESS =
  "0x8453000000000000000000000000000000000002" as Address;

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

export const B20_CREATE_PARAMS_VERSION = 1;
export const MIN_ASSET_DECIMALS = 6;
export const MAX_ASSET_DECIMALS = 18;
export const MAX_SUPPLY_CAP = (1n << 128n) - 1n;
export const WAD_PRECISION = 10n ** 18n;

export const ROLE_IDS = {
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
  MINT_ROLE: keccak256(toBytes("MINT_ROLE")),
  BURN_ROLE: keccak256(toBytes("BURN_ROLE")),
  BURN_BLOCKED_ROLE: keccak256(toBytes("BURN_BLOCKED_ROLE")),
  PAUSE_ROLE: keccak256(toBytes("PAUSE_ROLE")),
  UNPAUSE_ROLE: keccak256(toBytes("UNPAUSE_ROLE")),
  METADATA_ROLE: keccak256(toBytes("METADATA_ROLE")),
  OPERATOR_ROLE: keccak256(toBytes("OPERATOR_ROLE"))
} as const satisfies Record<string, Hex>;

export const POLICY_SCOPE_IDS = {
  TRANSFER_SENDER_POLICY: keccak256(toBytes("TRANSFER_SENDER_POLICY")),
  TRANSFER_RECEIVER_POLICY: keccak256(toBytes("TRANSFER_RECEIVER_POLICY")),
  TRANSFER_EXECUTOR_POLICY: keccak256(toBytes("TRANSFER_EXECUTOR_POLICY")),
  MINT_RECEIVER_POLICY: keccak256(toBytes("MINT_RECEIVER_POLICY"))
} as const satisfies Record<string, Hex>;

export const PAUSABLE_FEATURES = {
  TRANSFER: 0,
  MINT: 1,
  BURN: 2
} as const;

export const B20_VARIANT = {
  ASSET: 0,
  STABLECOIN: 1
} as const;

export type RoleName = keyof typeof ROLE_IDS;
export type PolicyScopeName = keyof typeof POLICY_SCOPE_IDS;
export type PausableFeatureName = keyof typeof PAUSABLE_FEATURES;
