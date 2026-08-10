import { afterEach, describe, expect, it } from "vitest";

import { createB20CdpFacilitatorClient } from "./x402-facilitator.js";

const originalApiKeyId = process.env.CDP_API_KEY_ID;
const originalApiKeySecret = process.env.CDP_API_KEY_SECRET;

afterEach(() => {
  if (originalApiKeyId === undefined) delete process.env.CDP_API_KEY_ID;
  else process.env.CDP_API_KEY_ID = originalApiKeyId;

  if (originalApiKeySecret === undefined) delete process.env.CDP_API_KEY_SECRET;
  else process.env.CDP_API_KEY_SECRET = originalApiKeySecret;
});

describe("createB20CdpFacilitatorClient", () => {
  it("fails before creating a client when either CDP credential is absent", () => {
    delete process.env.CDP_API_KEY_ID;
    delete process.env.CDP_API_KEY_SECRET;

    expect(() => createB20CdpFacilitatorClient()).toThrow(
      "Missing Coinbase CDP facilitator credentials: CDP_API_KEY_ID, CDP_API_KEY_SECRET"
    );
  });

  it("creates the official CDP client without exposing credentials", () => {
    process.env.CDP_API_KEY_ID = "test-api-key-id";
    process.env.CDP_API_KEY_SECRET = "test-api-key-secret";

    const client = createB20CdpFacilitatorClient();

    expect(typeof client.verify).toBe("function");
    expect(typeof client.settle).toBe("function");
    expect(typeof client.getSupported).toBe("function");
  });
});
