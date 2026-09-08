import { randomUUID } from "node:crypto";
import { buildUnsignedLaunchTransaction, normalizeLaunchDraft } from "@base-b20/b20";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindMetadataStage, prepareMetadata } from "./ipfs.js";
import { getPublicLogo, getPublicToken, listPublicTokens, publicTokenList } from "./public-tokens.js";
import { store } from "./store.js";

const stages: string[] = [];
const router = "0x1111111111111111111111111111111111111111";
const txHash = `0x${"ab".repeat(32)}` as const;

async function fixture(options: { published?: boolean; stablecoin?: boolean; name?: string; symbol?: string } = {}) {
  const body = await sharp({ create: { width: 128, height: 128, channels: 4, background: "blue" } }).png().toBuffer();
  const variant = options.stablecoin ? "stablecoin" : "asset";
  const name = options.name ?? "Public Logo";
  const symbol = options.symbol ?? "PLOGO";
  const prepared = await prepareMetadata({ name, symbol, variant }, { buffer: body, size: body.length, mimetype: "image/png", originalname: "logo.png" });
  stages.push(prepared.stageId);
  const normalized = normalizeLaunchDraft({ name, symbol, variant, admin: router, decimals: 8, currency: "USD", contractURI: prepared.contract.uri });
  const tx = buildUnsignedLaunchTransaction({ chainId: 8453, routerAddress: router, launch: normalized, builderCode: "b20_test" });
  await store.saveLaunch({ idempotencyKey: tx.idempotencyKey, predictedToken: tx.predictedToken, payload: tx, createdAt: new Date().toISOString() });
  await bindMetadataStage({ stageId: prepared.stageId, stageToken: prepared.stageToken, contractURI: prepared.contract.uri, idempotencyKey: tx.idempotencyKey, to: router, attributedData: tx.attributedData });
  const stage = await store.getMetadataStage(prepared.stageId);
  const normalizedLogo = stage!.logoBody!;
  if (options.published !== false) await store.completeMetadataStage(prepared.stageId, {
    ...prepared, storage: { ...prepared.storage, status: "committed", verified: true, uploadedAt: new Date().toISOString() }
  }, txHash);
  return { prepared, tx, normalizedLogo };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(stages.splice(0).map((id) => store.deleteMetadataStage(id)));
});

describe("public token discovery", () => {
  it("automatically exposes old committed launches, excludes staged launches and private credentials", async () => {
    const published = await fixture();
    const draft = await fixture({ published: false });
    const result = await listPublicTokens();
    expect(result.tokens.map((token) => token.address)).toEqual([published.tx.predictedToken]);
    expect(result.tokens[0]).toMatchObject({ decimals: 8, symbol: "PLOGO", transactionHash: txHash });
    const encoded = JSON.stringify(result);
    for (const secret of [published.prepared.stageToken!, published.prepared.stageId, published.tx.attributedData, "secretHash", "launchData", "stageToken"]) {
      expect(encoded).not.toContain(secret);
    }
    await expect(getPublicToken(draft.tx.predictedToken)).rejects.toMatchObject({ status: 404 });
    const lower = await getPublicToken(published.tx.predictedToken.toLowerCase());
    expect(lower.imageIpfs).toBe(published.prepared.logo.uri);
  });

  it("reads actual signed launch fields rather than a later overwritten quote payload", async () => {
    const { tx } = await fixture({ stablecoin: true });
    await store.saveLaunch({ idempotencyKey: tx.idempotencyKey, predictedToken: tx.predictedToken, payload: { name: "Spoofed", decimals: 18, stageToken: randomUUID() }, createdAt: new Date().toISOString() });
    expect(await getPublicToken(tx.predictedToken)).toMatchObject({ name: "Public Logo", decimals: 6, variant: "stablecoin" });
  });

  it("uses a bounded cursor without dropping or repeating tokens", async () => {
    await fixture(); await fixture();
    const first = await listPublicTokens({ limit: 1 });
    const second = await listPublicTokens({ limit: 1, after: first.nextCursor! });
    expect(first.tokens[0]!.address).not.toBe(second.tokens[0]!.address);
    expect(second.nextCursor).toBeNull();
    await expect(listPublicTokens({ limit: 501 })).rejects.toThrow();
    await expect(getPublicToken("../../private")).rejects.toThrow();
  });

  it("creates a stable token list and preserves long original labels in extensions", async () => {
    await fixture({ name: "A".repeat(90), symbol: "B".repeat(25) });
    const first = await publicTokenList();
    expect(first).toEqual(await publicTokenList());
    expect(first.tokens[0]).toMatchObject({ name: "A".repeat(60), symbol: "B".repeat(20), extensions: { originalName: "A".repeat(90), originalSymbol: "B".repeat(25) } });
    expect(first.tokens[0]!.logoURI).toMatch(/^https:\/\//);
  });

  it("refuses a mismatched address or traversal CID before any gateway fetch", async () => {
    const { prepared, tx } = await fixture();
    const stage = (await store.getMetadataStage(prepared.stageId))!;
    await store.completeMetadataStage(stage.stageId, { ...(stage.prepared as object), logo: { ...prepared.logo, cid: "../secret" } }, txHash);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(getPublicLogo(tx.predictedToken)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves exact published image bytes without a key and rejects changed or oversized responses", async () => {
    const { tx, normalizedLogo } = await fixture();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(normalizedLogo), { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPublicLogo(tx.predictedToken);
    expect(result.body).toEqual(normalizedLogo);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
    expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty("headers.Authorization");
    fetchMock.mockResolvedValue(new Response("corrupt", { headers: { "Content-Type": "image/png" } }));
    await expect(getPublicLogo(tx.predictedToken)).rejects.toMatchObject({ status: 502 });
    fetchMock.mockResolvedValue(new Response(new Uint8Array(1_000_001), { headers: { "Content-Type": "image/png" } }));
    await expect(getPublicLogo(tx.predictedToken)).rejects.toMatchObject({ status: 502 });
  });
});
