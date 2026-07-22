import { config } from "../config.js";

export function getAgentManifest() {
  return {
    name: "B20 Launcher Agent API",
    version: "0.1.0",
    chainId: config.BASE_CHAIN_ID,
    capabilities: [
      {
        id: "b20.stage_public_metadata",
        method: "POST",
        path: "/api/metadata/prepare",
        maxLogoBytes: 1_000_000,
        expiresInSeconds: 1800,
        output: "{ stageId, stageToken, expiresAt, logo, contract, storage }",
        behavior: "Computes deterministic CIDs without publishing to IPFS; stageToken must be kept private"
      },
      {
        id: "b20.build_unsigned_launch_transaction",
        method: "POST",
        path: "/x402/b20/build",
        price: config.X402_PRICE,
        network: config.X402_NETWORK,
        x402Enabled: config.X402_ENABLED,
        requiredHeaders: [
          "X-Metadata-Stage-Id: <stageId>",
          "X-Metadata-Stage-Token: <stageToken>"
        ],
        output:
          "{ chainId, to, value, data, attributedData, dataSuffix, predictedToken, metadata, expiresAt, idempotencyKey }"
      },
      {
        id: "b20.commit_public_metadata",
        method: "POST",
        path: "/api/metadata/commit",
        input: "{ stageId, stageToken, idempotencyKey, txHash }",
        behavior: "Publishes only after the exact matching Base launch transaction succeeds"
      }
    ],
    custody: "none",
    submitTransactions: false
  };
}
