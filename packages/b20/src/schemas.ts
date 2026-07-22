import { getAddress, isAddress, keccak256, parseUnits, toBytes, type Address, type Hex } from "viem";
import { z } from "zod";

import {
  MAX_ASSET_DECIMALS,
  MAX_SUPPLY_CAP,
  MIN_ASSET_DECIMALS,
  PAUSABLE_FEATURES,
  POLICY_SCOPE_IDS,
  ROLE_IDS,
  WAD_PRECISION,
  ZERO_ADDRESS,
  type PausableFeatureName,
  type PolicyScopeName,
  type RoleName
} from "./constants.js";

export const addressSchema = z
  .string()
  .refine((value) => isAddress(value), "Invalid EVM address")
  .transform((value) => getAddress(value) as Address);

export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected bytes32 hex")
  .transform((value) => value as Hex);

export const uintStringSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid unsigned integer");
      return BigInt(value);
    }
    if (!/^\d+$/.test(value)) throw new Error("Invalid unsigned integer string");
    return BigInt(value);
  });

export const decimalAmountSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value))
  .refine((value) => /^\d+(\.\d+)?$/.test(value), "Invalid decimal amount");

const roleNameSchema = z.enum(Object.keys(ROLE_IDS) as [RoleName, ...RoleName[]]);
const policyScopeNameSchema = z.enum(
  Object.keys(POLICY_SCOPE_IDS) as [PolicyScopeName, ...PolicyScopeName[]]
);
const pauseFeatureNameSchema = z.enum(
  Object.keys(PAUSABLE_FEATURES) as [PausableFeatureName, ...PausableFeatureName[]]
);

export const launchDraftSchema = z.object({
  variant: z.enum(["asset", "stablecoin"]),
  name: z.string().trim().min(1).max(128),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, "Symbol can use letters, numbers, dot, underscore, and dash"),
  description: z.string().trim().max(2000).optional().default(""),
  externalLink: z.string().url().optional().or(z.literal("")).default(""),
  contractURI: z.string().trim().min(1, "contractURI is required after metadata preparation"),
  admin: addressSchema,
  salt: bytes32Schema.optional(),
  supplyCap: decimalAmountSchema.optional(),
  decimals: z.number().int().min(MIN_ASSET_DECIMALS).max(MAX_ASSET_DECIMALS).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]+$/, "Stablecoin currency must use uppercase A-Z only")
    .optional(),
  roles: z.partialRecord(roleNameSchema, addressSchema).optional().default({}),
  initialMints: z
    .array(
      z.object({
        recipient: addressSchema,
        amount: decimalAmountSchema
      })
    )
    .max(500)
    .optional()
    .default([]),
  policies: z
    .partialRecord(policyScopeNameSchema, z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]))
    .optional()
    .default({}),
  pauseFeatures: z.array(pauseFeatureNameSchema).optional().default([]),
  extraMetadata: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(64),
        value: z.string().trim().max(256)
      })
    )
    .max(50)
    .optional()
    .default([]),
  multiplier: uintStringSchema.optional()
});

export type LaunchDraftInput = z.input<typeof launchDraftSchema>;
export type ParsedLaunchDraft = z.output<typeof launchDraftSchema>;

export type RouterRoleGrant = { role: Hex; account: Address };
export type RouterMint = { recipient: Address; amount: bigint };
export type RouterPolicy = { scope: Hex; policyId: bigint };
export type RouterExtraMetadata = { key: string; value: string };

export type NormalizedLaunch = {
  variant: "asset" | "stablecoin";
  description: string;
  externalLink: string | undefined;
  common: {
    name: string;
    symbol: string;
    admin: Address;
    salt: Hex;
    contractURI: string;
    supplyCap: bigint;
    roleGrants: RouterRoleGrant[];
    initialMints: RouterMint[];
    policies: RouterPolicy[];
    pauseFeatures: number[];
  };
  asset: {
    decimals: number;
    extraMetadata: RouterExtraMetadata[];
    multiplier: bigint;
  } | undefined;
  stablecoin: {
    currency: string;
  } | undefined;
  warnings: string[];
};

export function makeSalt(seed: string): Hex {
  return keccak256(toBytes(seed));
}

export function randomSalt(): Hex {
  const entropy =
    globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return makeSalt(`base-b20:${entropy}`);
}

export function normalizeLaunchDraft(input: LaunchDraftInput): NormalizedLaunch {
  const parsed = launchDraftSchema.parse(input);
  const salt = parsed.salt ?? randomSalt();
  const decimals = parsed.variant === "asset" ? (parsed.decimals ?? 18) : 6;
  const warnings: string[] = [];

  if (parsed.admin === ZERO_ADDRESS) {
    warnings.push("Admin is the zero address; this creates an admin-less token.");
  }
  if (parsed.variant === "stablecoin") {
    warnings.push("Stablecoin currency is self-declared and not legal certification.");
  }

  const roleGrants = Object.entries(parsed.roles)
    .filter((entry): entry is [RoleName, Address] => Boolean(entry[1]))
    .map(([role, account]) => ({ role: ROLE_IDS[role], account }));

  const initialMints = parsed.initialMints.map((mint) => ({
    recipient: mint.recipient,
    amount: parseUnits(mint.amount, decimals)
  }));

  const totalMint = initialMints.reduce((sum, mint) => sum + mint.amount, 0n);
  const supplyCap = parsed.supplyCap ? parseUnits(parsed.supplyCap, decimals) : MAX_SUPPLY_CAP;
  if (supplyCap < totalMint) {
    throw new Error("Supply cap cannot be below the initial minted supply.");
  }
  if (supplyCap > MAX_SUPPLY_CAP) {
    throw new Error("Supply cap cannot exceed type(uint128).max.");
  }

  const policies = Object.entries(parsed.policies)
    .filter((entry): entry is [PolicyScopeName, string | number] => entry[1] !== undefined)
    .map(([scope, policyId]) => ({
      scope: POLICY_SCOPE_IDS[scope],
      policyId: BigInt(policyId)
    }));

  const pauseFeatures = parsed.pauseFeatures.map((feature) => PAUSABLE_FEATURES[feature]);

  return {
    variant: parsed.variant,
    description: parsed.description,
    externalLink: parsed.externalLink || undefined,
    common: {
      name: parsed.name,
      symbol: parsed.symbol,
      admin: parsed.admin,
      salt,
      contractURI: parsed.contractURI,
      supplyCap,
      roleGrants,
      initialMints,
      policies,
      pauseFeatures
    },
    asset:
      parsed.variant === "asset"
        ? {
            decimals,
            extraMetadata: parsed.extraMetadata,
            multiplier: parsed.multiplier ?? WAD_PRECISION
          }
        : undefined,
    stablecoin:
      parsed.variant === "stablecoin"
        ? {
            currency: parsed.currency ?? "USD"
          }
        : undefined,
    warnings
  };
}
