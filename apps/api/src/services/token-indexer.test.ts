import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildUnsignedLaunchTransaction, normalizeLaunchDraft } from "@base-b20/b20";
import sharp from "sharp";
import { config } from "../config.js";
import { store } from "./store.js";
import { pipelineStore } from "./pipeline-store.js";
import { discoverLaunch, reconcileToken } from "./token-indexer.js";
import { prepareMetadata, bindMetadataStage } from "./ipfs.js";
import { getPublicToken, publicTokenChanges } from "./public-tokens.js";

const rpc = vi.hoisted(() => ({ getBlock: vi.fn(), getLogs: vi.fn(), getTransaction: vi.fn(), getTransactionReceipt: vi.fn(), readContract: vi.fn(), multicall: vi.fn() }));
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(), createPublicClient: () => rpc }));
const router = "0x1111111111111111111111111111111111111111" as const;
const txHash = `0x${"ab".repeat(32)}` as const;
const blockHash = `0x${"cd".repeat(32)}` as const;
const stages: string[] = [], jobs: string[] = [];
beforeEach(() => { config.B20_LAUNCH_ROUTER_ADDRESS = router; });
afterEach(async () => {
  vi.clearAllMocks(); vi.unstubAllGlobals();
  await Promise.all(stages.splice(0).map(id => store.deleteMetadataStage(id)));
  for (const id of jobs.splice(0)) { const job = await pipelineStore.claim(id); if (job) await pipelineStore.finish(job, null); }
});
async function fixture(committed = false) {
  const body = await sharp({ create: { width: 128, height: 128, channels: 4, background: "blue" } }).png().toBuffer();
  const prepared = await prepareMetadata({ name: "Original", symbol: "ORIG" }, { buffer: body, size: body.length, mimetype: "image/png", originalname: "logo.png" });
  stages.push(prepared.stageId);
  const launch = normalizeLaunchDraft({ name: "Original", symbol: "ORIG", variant: "asset", decimals: 18, admin: router, contractURI: prepared.contract.uri });
  const tx = buildUnsignedLaunchTransaction({ chainId: 8453, routerAddress: router, launch });
  await store.saveLaunch({ idempotencyKey: tx.idempotencyKey, predictedToken: tx.predictedToken, payload: tx, createdAt: new Date().toISOString() });
  await bindMetadataStage({ stageId: prepared.stageId, stageToken: prepared.stageToken, contractURI: prepared.contract.uri, idempotencyKey: tx.idempotencyKey, to: router, attributedData: tx.attributedData });
  await store.armMetadataPublication(prepared.stageId, tx.idempotencyKey, tx.attributedData);
  const stage = (await store.getMetadataStage(prepared.stageId))!;
  await store.savePublishedMetadata(prepared.stageId, { ...prepared, storage: { ...prepared.storage, status: "ready", verified: true } });
  if (committed) await store.completeMetadataStage(prepared.stageId, { ...prepared, storage: { ...prepared.storage, status: "committed", verified: true } }, txHash);
  const id = `test-index:${randomUUID()}`; jobs.push(id);
  await pipelineStore.enqueue(id, committed ? "token" : "launch", committed ? { address: tx.predictedToken } : { stageId: prepared.stageId, fromBlock: "100" });
  rpc.getBlock.mockResolvedValue({ number: 2000n, hash: blockHash });
  rpc.getTransaction.mockResolvedValue({ to: router, input: tx.attributedData });
  rpc.getTransactionReceipt.mockResolvedValue({ status: "success", transactionHash: txHash, blockNumber: 100n, blockHash });
  rpc.readContract.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.endsWith(prepared.logo.cid) ? new Uint8Array(stage.logoBody!) : stage.contractBody!)));
  return { id, prepared, tx, job: (await pipelineStore.claim(id))! };
}
describe("server discovery and metadata reconciliation", () => {
  it("finishes a launch after the browser disappears without needing its stage secret", async () => {
    const f = await fixture();
    rpc.getLogs.mockResolvedValue([{ transactionHash: txHash, args: { contractURI: f.prepared.contract.uri } }]);
    await discoverLaunch(f.job);
    expect((await store.getMetadataStage(f.prepared.stageId))?.status).toBe("committed");
    expect(await pipelineStore.claim(f.id)).toBeUndefined();
    expect((await getPublicToken(f.tx.predictedToken)).name).toBe("Original");
    jobs.push(`token:${f.tx.predictedToken.toLowerCase()}`);
  });
  it("advances only a successful bounded scan and retains its cursor across a failed RPC", async () => {
    const f = await fixture();
    rpc.getLogs.mockResolvedValue([]);
    await discoverLaunch(f.job);
    const retry = (await pipelineStore.claim(f.id))!;
    expect(retry.data.cursor).toBe("1100");
    rpc.getLogs.mockRejectedValue(new Error("RPC unavailable"));
    await expect(discoverLaunch(retry)).rejects.toThrow("RPC unavailable");
    await pipelineStore.finish(retry, 0, retry.data, "retry");
    const resumed = (await pipelineStore.claim(f.id))!;
    expect(resumed.data.cursor).toBe("1100");
    await pipelineStore.finish(resumed, null);
  });
  it("publishes changed onchain identity and profile in the incremental feed", async () => {
    const f = await fixture(true);
    const updatedUri = `ipfs://bafybei${"a".repeat(52)}`;
    rpc.multicall.mockResolvedValue(["Updated Name", "NEW", 18, updatedUri]);
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => url.endsWith(updatedUri.slice(7))
      ? new Response(JSON.stringify({ name: "Updated Name", description: "Updated profile", image: f.prepared.logo.uri })) : originalFetch(url, options)));
    await reconcileToken(f.job);
    const token = await getPublicToken(f.tx.predictedToken);
    expect(token).toMatchObject({ name: "Updated Name", symbol: "NEW", contractURI: updatedUri, description: "Updated profile", metadataSource: "onchain-contractURI" });
    const feed = await publicTokenChanges();
    expect(feed.changes.some(change => change.token.name === "Updated Name")).toBe(true);
    expect(JSON.stringify(feed)).not.toContain(f.prepared.stageToken!);
    const retry = (await pipelineStore.claim(f.id))!;
    rpc.readContract.mockResolvedValue(false);
    await expect(reconcileToken(retry)).rejects.toThrow("not initialized");
    expect((await getPublicToken(f.tx.predictedToken)).revision).toBe(token.revision);
    await pipelineStore.finish(retry, null);
  });
});
