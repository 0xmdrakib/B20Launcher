import { describe, expect, it } from "vitest";

import {
  appendBuilderCodeSuffix,
  encodeBuilderCodeDataSuffix,
  hasErc8021Marker,
  normalizeLaunchDraft,
  predictB20Address,
  ZERO_ADDRESS
} from "../src/index.js";

describe("builder code suffix", () => {
  it("matches the Base docs sample for baseapp", () => {
    expect(encodeBuilderCodeDataSuffix("baseapp")).toBe(
      "0x07626173656170700080218021802180218021802180218021"
    );
  });

  it("appends an ERC-8021 marker to calldata", () => {
    const data = appendBuilderCodeSuffix("0x1234", "baseapp");
    expect(data.startsWith("0x1234")).toBe(true);
    expect(hasErc8021Marker(data)).toBe(true);
  });
});

describe("B20 launch normalization", () => {
  it("normalizes asset launch inputs and parses token amounts by decimals", () => {
    const launch = normalizeLaunchDraft({
      variant: "asset",
      name: "Test Asset",
      symbol: "TST",
      description: "Test",
      contractURI: "ipfs://mock",
      admin: "0x1111111111111111111111111111111111111111",
      decimals: 6,
      supplyCap: "1000",
      initialMints: [
        {
          recipient: "0x2222222222222222222222222222222222222222",
          amount: "12.5"
        }
      ]
    });

    expect(launch.variant).toBe("asset");
    expect(launch.common.supplyCap).toBe(1_000_000_000n);
    expect(launch.common.initialMints[0]?.amount).toBe(12_500_000n);
  });

  it("emits an admin-less warning instead of rejecting zero admin", () => {
    const launch = normalizeLaunchDraft({
      variant: "stablecoin",
      name: "USD Test",
      symbol: "USDT",
      contractURI: "ipfs://mock",
      admin: ZERO_ADDRESS,
      currency: "USD"
    });

    expect(launch.warnings.join(" ")).toContain("admin-less");
    expect(launch.warnings.join(" ")).toContain("self-declared");
  });
});

describe("B20 address prediction", () => {
  it("encodes the B20 prefix and variant byte", () => {
    const token = predictB20Address({
      variant: "stablecoin",
      creator: "0x3333333333333333333333333333333333333333",
      salt: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    expect(token.toLowerCase()).toMatch(/^0xb200000000000000000001[0-9a-f]{18}$/);
  });
});
