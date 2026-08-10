import { describe, expect, it } from "vitest";
import { validateUnsignedLaunchTransaction } from "./launch-validation";

const valid = {
  chainId: 8453,
  to: "0x1111111111111111111111111111111111111111",
  value: "0",
  data: "0x1234",
  attributedData: "0x123456",
  expiresAt: new Date(Date.now() + 60_000).toISOString()
};

describe("unsigned launch validation", () => {
  it("accepts a fresh zero-value Base transaction matching the form", () => {
    expect(validateUnsignedLaunchTransaction(valid, { expectedChainId: 8453, quoteFingerprint: "a", currentFingerprint: "a" })).toBeNull();
  });

  it.each([
    ["wrong chain", { chainId: 1 }],
    ["non-zero value", { value: "1" }],
    ["missing calldata", { data: "0x" }],
    ["fingerprint mismatch", {}]
  ])("rejects %s", (_label, override) => {
    const transaction = { ...valid, ...override };
    const result = validateUnsignedLaunchTransaction(transaction, {
      expectedChainId: 8453,
      quoteFingerprint: "quoted",
      currentFingerprint: override && Object.keys(override).length === 0 ? "edited" : "quoted"
    });
    expect(result).toBeTruthy();
  });

  it("rejects an expired quote", () => {
    expect(validateUnsignedLaunchTransaction({ ...valid, expiresAt: new Date(0).toISOString() }, { expectedChainId: 8453, quoteFingerprint: "a", currentFingerprint: "a", now: 1 })).toContain("expired");
  });
});
