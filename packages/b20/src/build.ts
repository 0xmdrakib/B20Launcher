import { encodeFunctionData, type Address, type Hex } from "viem";

import { b20LaunchRouterAbi } from "./abis.js";
import { appendBuilderCodeSuffix } from "./builder-code.js";
import { predictB20Address } from "./address.js";
import type { NormalizedLaunch } from "./schemas.js";

export type UnsignedLaunchTransaction = {
  chainId: number;
  to: Address;
  value: "0";
  data: Hex;
  attributedData: Hex;
  dataSuffix: Hex | undefined;
  predictedToken: Address;
  salt: Hex;
  expiresAt: string;
  idempotencyKey: string;
  metadata: {
    variant: "asset" | "stablecoin";
    name: string;
    symbol: string;
    contractURI: string;
    warnings: string[];
  };
};

function toRouterAssetArgs(launch: NormalizedLaunch) {
  if (!launch.asset) throw new Error("Expected asset launch");
  return {
    common: launch.common,
    decimals: launch.asset.decimals,
    extraMetadata: launch.asset.extraMetadata,
    multiplier: launch.asset.multiplier
  };
}

function toRouterStablecoinArgs(launch: NormalizedLaunch) {
  if (!launch.stablecoin) throw new Error("Expected stablecoin launch");
  return {
    common: launch.common,
    currency: launch.stablecoin.currency
  };
}

export function encodeLaunchRouterData(launch: NormalizedLaunch): Hex {
  if (launch.variant === "asset") {
    return encodeFunctionData({
      abi: b20LaunchRouterAbi,
      functionName: "launchAsset",
      args: [toRouterAssetArgs(launch)]
    });
  }

  return encodeFunctionData({
    abi: b20LaunchRouterAbi,
    functionName: "launchStablecoin",
    args: [toRouterStablecoinArgs(launch)]
  });
}

export function buildUnsignedLaunchTransaction(input: {
  chainId: number;
  routerAddress: Address;
  launch: NormalizedLaunch;
  builderCode?: string;
  expiresInSeconds?: number;
}): UnsignedLaunchTransaction {
  const data = encodeLaunchRouterData(input.launch);
  const dataSuffix = input.builderCode ? appendBuilderCodeSuffix("0x", input.builderCode) : undefined;
  const attributedData = appendBuilderCodeSuffix(data, input.builderCode);
  const predictedToken = predictB20Address({
    variant: input.launch.variant,
    creator: input.routerAddress,
    salt: input.launch.common.salt
  });
  const expiresAt = new Date(
    Date.now() + (input.expiresInSeconds ?? 10 * 60) * 1000
  ).toISOString();

  return {
    chainId: input.chainId,
    to: input.routerAddress,
    value: "0",
    data,
    attributedData,
    dataSuffix,
    predictedToken,
    salt: input.launch.common.salt,
    expiresAt,
    idempotencyKey: `${input.chainId}:${input.routerAddress}:${input.launch.common.salt}`,
    metadata: {
      variant: input.launch.variant,
      name: input.launch.common.name,
      symbol: input.launch.common.symbol,
      contractURI: input.launch.common.contractURI,
      warnings: input.launch.warnings
    }
  };
}
