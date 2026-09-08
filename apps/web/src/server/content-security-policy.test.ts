import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "../../proxy";

const dedicatedOrigin = "https://protective-walrus-h5noy.lighthouseweb3.xyz";

function policy() {
  return proxy(new NextRequest("https://b20launcher.rakibhq.xyz"))
    .headers.get("Content-Security-Policy")!;
}

describe("Lighthouse image security policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    `${dedicatedOrigin}/ipfs`,
    `${dedicatedOrigin}/ipfs/`,
    "https://protective-walrus-h5noy.lighthouse.storage/ipfs"
  ])("allows images from the configured gateway without allowing arbitrary hosts: %s", (gateway) => {
    vi.stubEnv("LIGHTHOUSE_GATEWAY_URL", gateway);
    vi.stubEnv("NODE_ENV", "production");
    const value = policy();
    expect(value.split("; ").find((directive) => directive.startsWith("img-src "))).toBe(
      `img-src 'self' blob: data: https://gateway.lighthouse.storage ${dedicatedOrigin}`
    );
    expect(value).toContain("'strict-dynamic'");
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("frame-ancestors 'none'");
    expect(value).toContain("upgrade-insecure-requests");
    expect(value).not.toContain("'unsafe-eval'");
    expect(policy()).not.toBe(value);
  });

  it.each([undefined, ""])("preserves the shared gateway default for %s", (gateway) => {
    vi.stubEnv("LIGHTHOUSE_GATEWAY_URL", gateway);
    expect(policy().split("; ").find((directive) => directive.startsWith("img-src "))).toBe(
      "img-src 'self' blob: data: https://gateway.lighthouse.storage"
    );
  });

  it("rejects gateway credentials instead of putting them in a response header", () => {
    vi.stubEnv("LIGHTHOUSE_GATEWAY_URL", "https://secret@gateway.lighthouse.storage/ipfs");
    expect(policy).toThrow("HTTPS /ipfs URL");
  });
});
