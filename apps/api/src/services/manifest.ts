import { config } from "../config.js";

export function getAgentManifest() {
  return {
    name: "B20 Launcher Agent API",
    version: "0.2.0",
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
        id: "b20.approve_publication",
        method: "POST",
        path: "/api/metadata/publication-challenge",
        input: "{ stageId, stageToken, idempotencyKey, account }",
        output: "{ message, deadline }",
        behavior: "Sign the exact returned message with the launch wallet; no gas or token transfer"
      },
      {
        id: "b20.publish_before_launch",
        method: "POST",
        path: "/api/metadata/publish",
        input: "{ stageId, stageToken, idempotencyKey, account, deadline, signature }",
        behavior: "Pins and verifies logo and profile bytes, then arms durable launch discovery. Broadcast only after storage.status is ready and verified is true."
      },
      {
        id: "b20.commit_public_metadata",
        method: "POST",
        path: "/api/metadata/commit",
        input: "{ stageId, stageToken, idempotencyKey, txHash }",
        behavior: "Confirms the exact launch transaction and queues indexing. The server also discovers the launch if the client disconnects."
      },
      {
        id: "b20.metadata_changes",
        method: "GET",
        path: "/api/tokens/changes?after=0",
        behavior: "Incremental verified metadata feed. Save nextCursor and poll again; follow hasMore to drain a page sequence."
      }
    ],
    custody: "none",
    submitTransactions: false
  };
}
