import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadToLighthouse } from "./lighthouse.js";

describe("Lighthouse upload adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forces the same CIDv1 DAG-PB codec used during metadata staging", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ Hash: "bafy-test", Size: "42" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadToLighthouse(Buffer.from("logo"), "logo.png", "secret")).resolves.toEqual({
      Hash: "bafy-test",
      Size: "42"
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("cid-version=1");
    expect(url).toContain("raw-leaves=false");
    expect(url).toContain("wrap-with-directory=false");
    expect(request.headers).toEqual({ Authorization: "Bearer secret" });
    expect(request.body).toBeInstanceOf(FormData);
  });

  it("rejects malformed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    await expect(uploadToLighthouse("metadata", "metadata.json", "secret")).rejects.toMatchObject({
      status: 502,
      message: "Lighthouse returned an invalid upload response."
    });
  });
});
