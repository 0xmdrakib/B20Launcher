import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@base-b20/api/core";
import { publicTokenRoute } from "./public-token-route";

vi.mock("@base-b20/api/core", async (importOriginal) => ({
  ...await importOriginal<object>(),
  ensureStoreReady: vi.fn().mockResolvedValue(undefined)
}));

describe("public token HTTP responses", () => {
  it("allows anonymous cross-origin readers and supports conditional requests", async () => {
    const data = { tokens: [{ name: "Public Token", logoURI: "https://example.com/logo.png" }] };
    const first = await publicTokenRoute(new NextRequest("https://example.com/api/tokens"), async () => data);
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(first.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    const second = await publicTokenRoute(new NextRequest("https://example.com/api/tokens", { headers: { "if-none-match": first.headers.get("etag")! } }), async () => data);
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });
  it("never caches a missing record or temporary failure", async () => {
    const response = await publicTokenRoute(new NextRequest("https://example.com/api/tokens/missing"), async () => { throw new ApiError("Published token not found.", 404); });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("ETag")).toBeNull();
  });
});
