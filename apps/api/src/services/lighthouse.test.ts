import { afterEach, describe, expect, it, vi } from "vitest";

import { assertLighthouseUploadAvailable, uploadToLighthouse } from "./lighthouse.js";

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

  it("blocks launch preparation when the storage trial has expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: "Trial expired",
            details: "Your trial period has expired. Please upgrade to a paid plan"
          }),
          { status: 403, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(assertLighthouseUploadAvailable("secret")).rejects.toMatchObject({
      status: 503,
      message:
        "Token launches are temporarily unavailable because the Lighthouse storage plan has expired. No transaction was created."
    });
  });

  it("uses an empty multipart request without uploading a file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "A file is required" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertLighthouseUploadAvailable("secret")).resolves.toBeUndefined();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.body).toBeInstanceOf(FormData);
    expect(Array.from((request.body as FormData).keys())).toEqual([]);
  });
});
