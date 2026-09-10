import { expect, it, vi } from "vitest";
import { config } from "../config.js";
import { getB20Status } from "./b20.js";
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(),
  createPublicClient: () => ({ readContract: async () => true }) }));

it("keeps credential-bearing RPC URLs out of public status responses", async () => {
  const original = config.BASE_RPC_URL;
  try {
    config.BASE_RPC_URL = "https://example.com/v2/private-rpc-key";
    const status = await getB20Status("0xb200000000000000000000D9B4BfBC70F8929C64");
    expect(status.network).toEqual({ chainId: 8453 });
    expect(JSON.stringify(status)).not.toContain("private-rpc-key");
  } finally { config.BASE_RPC_URL = original; }
});
