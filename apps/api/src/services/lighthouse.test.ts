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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dataLimit: 5 * 1024 ** 3, dataLimitPermanent: 0 }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileList: [{ createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000 }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertLighthouseUploadAvailable("secret")).rejects.toMatchObject({
      status: 503,
      message:
        "Token launches are temporarily unavailable because the Lighthouse storage plan has expired. No transaction was created."
    });
  });

  it("allows an active free trial without uploading a canary file", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dataLimit: 5 * 1024 ** 3, dataLimitPermanent: 0 }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileList: [{ createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertLighthouseUploadAvailable("secret")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, request]) => request?.method === undefined)).toBe(true);
  });

  it("allows a paid storage quota without inspecting upload history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ dataLimit: 500 * 1024 ** 3, dataLimitPermanent: 0 }), {
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertLighthouseUploadAvailable("secret")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
