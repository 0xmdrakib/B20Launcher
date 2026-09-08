import { describe, expect, it } from "vitest";

import { DEFAULT_LIGHTHOUSE_GATEWAY_URL, normalizeLighthouseGatewayUrl } from "./lighthouse-gateway.js";

describe("Lighthouse gateway URL normalization", () => {
  it("uses the public shared gateway when no dedicated gateway is configured", () => {
    expect(normalizeLighthouseGatewayUrl(DEFAULT_LIGHTHOUSE_GATEWAY_URL)).toBe(
      "https://gateway.lighthouse.storage/ipfs"
    );
  });

  it.each([
    "http://gateway.lighthouse.storage/ipfs",
    "https://*.lighthouseweb3.xyz/ipfs",
    "https://secret@gateway.lighthouse.storage/ipfs",
    "https://gateway.lighthouse.storage/ipfs?token=secret",
    "https://gateway.lighthouse.storage/ipfs#fragment",
    "https://gateway.lighthouse.storage/api/v0/add"
  ])("rejects an unsafe or incorrect gateway URL: %s", (gateway) => {
    expect(() => normalizeLighthouseGatewayUrl(gateway)).toThrow("HTTPS /ipfs URL");
  });

  it("migrates the obsolete dedicated gateway domain", () => {
    expect(
      normalizeLighthouseGatewayUrl(
        "https://protective-walrus-h5noy.lighthouse.storage/ipfs"
      )
    ).toBe("https://protective-walrus-h5noy.lighthouseweb3.xyz/ipfs");
  });

  it("preserves the premium shared gateway", () => {
    expect(normalizeLighthouseGatewayUrl("https://gateway.lighthouse.storage/ipfs")).toBe(
      "https://gateway.lighthouse.storage/ipfs"
    );
  });

  it("preserves the current dedicated gateway domain", () => {
    expect(
      normalizeLighthouseGatewayUrl(
        "https://protective-walrus-h5noy.lighthouseweb3.xyz/ipfs/"
      )
    ).toBe("https://protective-walrus-h5noy.lighthouseweb3.xyz/ipfs");
  });
});
