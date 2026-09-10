import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";
import { store, type MetadataStageRecord } from "./store.js";
import { pipelineStore } from "./pipeline-store.js";
import { cleanupAbandonedMetadata } from "./metadata-cleanup.js";
import { stageUploadNames, type LighthouseFile } from "./lighthouse.js";

const rpc = vi.hoisted(() => ({ getBlock: vi.fn(), readContract: vi.fn() }));
const provider = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }));
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(), createPublicClient: () => rpc }));
vi.mock("./lighthouse.js", async original => ({ ...await original<typeof import("./lighthouse.js")>(),
  listLighthouseAnnualFiles: provider.list, deleteLighthouseFile: provider.remove }));
const ids: string[] = [];
let files: LighthouseFile[];
beforeEach(() => {
  config.LIGHTHOUSE_API_KEY = "test-only";
  files = [];
  rpc.getBlock.mockResolvedValue({ number: 500n, timestamp: BigInt(Math.floor(Date.now()/1000)) });
  rpc.readContract.mockResolvedValue(false);
  provider.list.mockImplementation(async () => [...files]);
  provider.remove.mockImplementation(async (id: string) => { files = files.filter(file => file.id !== id); });
});
afterEach(async () => { vi.resetAllMocks(); await Promise.all(ids.splice(0).map(id => store.deleteMetadataStage(id))); });
async function fixture(logoCid: string = randomUUID()) {
  const stageId = randomUUID(); ids.push(stageId);
  const key = randomUUID();
  const stage: MetadataStageRecord = {
    stageId, secretHash: "secret", contractUri: `ipfs://${randomUUID()}`,
    expiresAt: new Date(Date.now()-26*3600_000).toISOString(), status: "publishing",
    logoBody: Buffer.from("logo"), contractBody: "{}", publicationFromBlock: "100",
    binding: { idempotencyKey: key, to: "0x1111111111111111111111111111111111111111", attributedData: "0x1234" },
    prepared: { logo: { cid: logoCid }, contract: { cid: randomUUID() }, storage: { status: "ready", verified: true } }
  };
  await store.saveMetadataStage(stage);
  await store.saveLaunch({ idempotencyKey: key, predictedToken: stage.binding!.to, payload: {}, createdAt: new Date().toISOString() });
  const p = stage.prepared as { logo: { cid: string }; contract: { cid: string } };
  const names = stageUploadNames(stageId);
  files.push({ id: randomUUID(), cid: p.logo.cid, fileName: names.logo }, { id: randomUUID(), cid: p.contract.cid, fileName: names.contract });
  return { stage, p };
}

describe("abandoned publication cleanup", () => {
  it("never sends a confirmed launch to storage deletion, regardless of expiry", async () => {
    const f = await fixture();
    await store.completeMetadataStage(f.stage.stageId, f.stage.prepared, `0x${"ab".repeat(32)}`);
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(true);
    expect(provider.list).not.toHaveBeenCalled();
    expect(provider.remove).not.toHaveBeenCalled();
    expect((await store.getMetadataStage(f.stage.stageId))!.status).toBe("committed");
  });
  it("deletes only matching owned file IDs and clears bytes after provider verification", async () => {
    const f = await fixture();
    const unrelated = { id: randomUUID(), cid: randomUUID(), fileName: "another-project.png" }; files.push(unrelated);
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(true);
    expect(files).toEqual([unrelated]);
    expect(provider.remove).toHaveBeenCalledTimes(2);
    expect(await store.getMetadataStage(f.stage.stageId)).toMatchObject({ cleanupState: "complete", secretHash: "consumed" });
    expect((await store.getMetadataStage(f.stage.stageId))!.logoBody).toBeUndefined();
  });
  it("preserves live tokens, unsafe-head launches, and RPC uncertainty", async () => {
    const f = await fixture();
    rpc.readContract.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(cleanupAbandonedMetadata(f.stage.stageId)).rejects.toThrow("may be live");
    rpc.readContract.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(cleanupAbandonedMetadata(f.stage.stageId)).rejects.toThrow("RPC unavailable");
    expect(provider.remove).not.toHaveBeenCalled();
    expect((await store.getMetadataStage(f.stage.stageId))!.cleanupState).toBeUndefined();
  });
  it("does not delete files before expiry plus grace or when the safe head lags", async () => {
    const f = await fixture();
    rpc.getBlock.mockResolvedValueOnce({ timestamp: 1n });
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(false);
    await store.saveMetadataStage({ ...f.stage, expiresAt: new Date(Date.now()+3600_000).toISOString() });
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(false);
    expect(provider.remove).not.toHaveBeenCalled();
  });
  it.each(["committed", "receipt"])("preserves a logo shared by a token with %s confirmation", async (state) => {
    const first = await fixture(), live = await fixture(first.p.logo.cid);
    if (state === "committed") await store.completeMetadataStage(live.stage.stageId, live.stage.prepared, `0x${"ab".repeat(32)}`);
    else await store.markMetadataPublishing(live.stage.stageId, `0x${"ab".repeat(32)}`);
    expect(await cleanupAbandonedMetadata(first.stage.stageId)).toBe(true);
    expect(files.some(file => file.fileName === stageUploadNames(first.stage.stageId).logo)).toBe(true);
    expect(provider.remove).toHaveBeenCalledTimes(1);
  });
  it("preserves a CID also referenced by an unrelated account file", async () => {
    const f = await fixture();
    files.push({ id: randomUUID(), cid: f.p.logo.cid, fileName: "another-project.png" });
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(true);
    expect(provider.remove).toHaveBeenCalledTimes(1);
    expect(files).toHaveLength(2);
  });
  it("waits for another unfinished launch sharing a logo, then cleans both abandoned stages", async () => {
    const first = await fixture(), second = await fixture(first.p.logo.cid);
    expect(await cleanupAbandonedMetadata(first.stage.stageId)).toBe(false);
    expect((await store.getMetadataStage(first.stage.stageId))!.logoBody).toBeDefined();
    expect(await cleanupAbandonedMetadata(second.stage.stageId)).toBe(true);
    expect(await cleanupAbandonedMetadata(first.stage.stageId)).toBe(true);
    expect(files).toEqual([]);
  });
  it("retains evidence and retries when a delete response is lost after remote success", async () => {
    const f = await fixture();
    provider.remove.mockImplementationOnce(async (id: string) => { files = files.filter(file => file.id !== id); throw new Error("timeout"); });
    await expect(cleanupAbandonedMetadata(f.stage.stageId)).rejects.toThrow("timeout");
    await store.cleanupMetadataStages();
    expect(await store.getMetadataStage(f.stage.stageId)).toMatchObject({ cleanupState: "pending" });
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(true);
    const journal = JSON.parse((await pipelineStore.readState(`cleanup:${f.stage.stageId}`))!);
    expect(journal.attemptedIds).toHaveLength(2);
    expect(files).toEqual([]);
  });
  it("cleans a partial upload without touching legacy file names", async () => {
    const f = await fixture();
    files = files.slice(0, 1);
    files.push({ id: randomUUID(), cid: f.p.contract.cid, fileName: "b20-contract-metadata.json" });
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(true);
    expect(files).toHaveLength(1);
    expect(files[0]!.fileName).toBe("b20-contract-metadata.json");
  });
  it("serializes publication and cleanup across overlapping operations", async () => {
    const f = await fixture();
    await store.withPublicationLock(async () => {
      await expect(cleanupAbandonedMetadata(f.stage.stageId)).rejects.toMatchObject({ status: 409 });
    });
    expect(provider.remove).not.toHaveBeenCalled();
    expect(await cleanupAbandonedMetadata(f.stage.stageId)).toBe(true);
  });
});
