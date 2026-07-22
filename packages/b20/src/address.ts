import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  type Address,
  type Hex
} from "viem";

import { B20_VARIANT } from "./constants.js";

export type B20VariantName = "asset" | "stablecoin";

export function variantToDiscriminant(variant: B20VariantName): number {
  return variant === "asset" ? B20_VARIANT.ASSET : B20_VARIANT.STABLECOIN;
}

export function discriminantToVariant(discriminant: number): B20VariantName {
  if (discriminant === B20_VARIANT.ASSET) return "asset";
  if (discriminant === B20_VARIANT.STABLECOIN) return "stablecoin";
  throw new Error(`Unsupported B20 variant discriminant: ${discriminant}`);
}

export function predictB20Address(input: {
  variant: B20VariantName;
  creator: Address;
  salt: Hex;
}): Address {
  if (!isAddress(input.creator)) {
    throw new Error("creator must be a valid EVM address");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.salt)) {
    throw new Error("salt must be bytes32");
  }

  const hash = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [input.creator, input.salt]
    )
  );
  const variantByte = variantToDiscriminant(input.variant)
    .toString(16)
    .padStart(2, "0");
  const tail = hash.slice(2, 20);
  return getAddress(`0xb2${"00".repeat(9)}${variantByte}${tail}`);
}

export function isB20Address(address: string): boolean {
  if (!isAddress(address)) return false;
  const lower = address.toLowerCase();
  return /^0xb2000000000000000000(00|01)[0-9a-f]{18}$/.test(lower);
}
