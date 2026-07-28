import { describe, expect, it } from "vitest";

import { normalizeLighthouseGatewayUrl } from "./lighthouse-gateway.js";

describe("Lighthouse gateway URL normalization", () => {
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
