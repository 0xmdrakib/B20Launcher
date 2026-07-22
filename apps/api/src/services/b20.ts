import {
  B20_FACTORY_ADDRESS,
  ZERO_ADDRESS,
  buildUnsignedLaunchTransaction,
  b20FactoryAbi,
  isB20Address,
  normalizeLaunchDraft,
  type LaunchDraftInput
} from "@base-b20/b20";
import { createPublicClient, http, isAddress, type Address } from "viem";

import { config } from "../config.js";
import { bindMetadataStage } from "./ipfs.js";
import { store } from "./store.js";

const publicClient = createPublicClient({
  transport: http(config.BASE_RPC_URL)
});

export type MetadataStageAuth = {
  stageId?: string | undefined;
  stageToken?: string | undefined;
};

export async function buildLaunchPackage(input: LaunchDraftInput, metadataAuth: MetadataStageAuth = {}) {
  const launch = normalizeLaunchDraft(input);
  if (config.B20_LAUNCH_ROUTER_ADDRESS === ZERO_ADDRESS) {
    launch.warnings.push("B20 launch router address is not configured; deploy the router before mainnet signing.");
  }
  const tx = buildUnsignedLaunchTransaction({
    chainId: config.BASE_CHAIN_ID,
    routerAddress: config.B20_LAUNCH_ROUTER_ADDRESS,
    launch,
    builderCode: config.BASE_BUILDER_CODE
  });

  await bindMetadataStage({
    stageId: metadataAuth.stageId,
    contractURI: launch.common.contractURI,
    stageToken: metadataAuth.stageToken,
    idempotencyKey: tx.idempotencyKey,
    to: tx.to,
    attributedData: tx.attributedData
  });

  await store.saveLaunch({
    idempotencyKey: tx.idempotencyKey,
    predictedToken: tx.predictedToken,
    payload: tx,
    createdAt: new Date().toISOString()
  });

  return { launch, tx };
}

export async function quoteLaunch(input: LaunchDraftInput, metadataAuth: MetadataStageAuth = {}) {
  const { launch, tx } = await buildLaunchPackage(input, metadataAuth);
  let gasEstimate: string | null = null;

  try {
    if (config.B20_LAUNCH_ROUTER_ADDRESS === ZERO_ADDRESS) {
      throw new Error("Router not configured");
    }
    const estimate = await publicClient.estimateGas({
      account: launch.common.admin,
      to: tx.to,
      data: tx.attributedData
    });
    gasEstimate = estimate.toString();
  } catch {
    gasEstimate = null;
  }

  return {
    predictedToken: tx.predictedToken,
    salt: tx.salt,
    gasEstimate,
    warnings: launch.warnings,
    transaction: tx
  };
}

export async function getB20Status(address: Address) {
  if (!isAddress(address)) throw new Error("Invalid address");

  let initialized: boolean | null = null;
  if (isB20Address(address)) {
    try {
      initialized = await publicClient.readContract({
        address: B20_FACTORY_ADDRESS,
        abi: b20FactoryAbi,
        functionName: "isB20Initialized",
        args: [address]
      });
    } catch {
      initialized = null;
    }
  }

  return {
    address,
    isB20Address: isB20Address(address),
    initialized,
    network: {
      chainId: config.BASE_CHAIN_ID,
      rpcUrl: config.BASE_RPC_URL
    },
    analytics: {
      transfers24h: null,
      holders: null,
      policyEvents: null,
      source: config.CDP_SQL_API_KEY ? "cdp-sql-api" : "not-configured"
    }
  };
}
