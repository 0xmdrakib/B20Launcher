import { afterEach, describe, expect, it, vi } from "vitest";
import { PipelineStore } from "./pipeline-store.js";
import { assertIndexerClaims, authorizeIndexer } from "./token-indexer.js";
import { resolveIpfs, readIpfs } from "./ipfs-reader.js";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("durable metadata pipeline", () => {
  it("claims once, recovers a crashed lease, and fences the old worker", async () => {
    vi.useFakeTimers();
    const store = new PipelineStore();
    await store.enqueue("a", "token", { address: "0x1" });
    const first = (await store.claim())!;
    expect(await store.claim()).toBeUndefined();
    vi.advanceTimersByTime(301_000);
    const second = (await store.claim())!;
    expect(second.lease).not.toBe(first.lease);
    await expect(store.saveSnapshot("0x1", { name: "stale" }, first)).rejects.toThrow("lease expired");
    await store.finish(first, null);
    await store.saveSnapshot("0x1", { name: "valid" }, second);
    expect((await store.getSnapshot("0x1"))?.document.name).toBe("valid");
  });
  it("records updates once and resumes incremental reads without omissions", async () => {
    const store = new PipelineStore();
    await store.enqueue("a", "token", {});
    const job = (await store.claim())!;
    await store.saveSnapshot("0x1", { logo: "first" }, job);
    await store.saveSnapshot("0x1", { logo: "first" }, job);
    await store.saveSnapshot("0x1", { logo: "second" }, job);
    const page = await store.listChanges(0, 1);
    expect(page[0]?.revision).toBe(1);
    expect((await store.listChanges(page[0]!.revision, 10)).map(c => c.token.logo)).toEqual(["second"]);
  });
  it("does not churn revisions when Postgres JSONB reorders object keys", async () => {
    const store = new PipelineStore();
    await store.enqueue("a", "token", {});
    const job = (await store.claim())!;
    await store.saveSnapshot("0x1", { name: "A", metadata: { image: "ipfs://a", name: "A" } }, job);
    await store.saveSnapshot("0x1", { metadata: { name: "A", image: "ipfs://a" }, name: "A" }, job);
    expect(await store.listChanges(0, 100)).toHaveLength(1);
  });
  it("bumps token-list versions for additions, metadata edits, and breaking changes", async () => {
    const store = new PipelineStore();
    const a = { address: "a", decimals: 18, name: "A" };
    expect(await store.tokenListVersion([a])).toEqual({ major: 1, minor: 1, patch: 0 });
    expect(await store.tokenListVersion([a])).toEqual({ major: 1, minor: 1, patch: 0 });
    expect(await store.tokenListVersion([{ ...a, name: "B" }])).toEqual({ major: 1, minor: 1, patch: 1 });
    expect(await store.tokenListVersion([{ ...a, name: "B" }, { ...a, address: "b" }])).toEqual({ major: 1, minor: 2, patch: 0 });
    expect(await store.tokenListVersion([a])).toEqual({ major: 2, minor: 0, patch: 0 });
  });
  it("denies unauthenticated workers, forks, PRs, and another workflow", async () => {
    await expect(authorizeIndexer(null)).rejects.toMatchObject({ status: 401 });
    const claims = { repository_id: "1308824806", repository_owner_id: "113634586", repository: "0xmdrakib/B20Launcher", ref: "refs/heads/main", workflow_ref: "0xmdrakib/B20Launcher/.github/workflows/token-indexer.yml@refs/heads/main", event_name: "schedule" };
    expect(() => assertIndexerClaims(claims)).not.toThrow();
    for (const change of [{ repository_id: "1" }, { event_name: "pull_request" }, { ref: "refs/heads/other" }, { workflow_ref: "untrusted" }]) expect(() => assertIndexerClaims({ ...claims, ...change })).toThrow();
  });
  it("blocks arbitrary hosts, traversal and oversized streams", async () => {
    const cid = `bafybei${"a".repeat(52)}`;
    for (const uri of ["https://127.0.0.1/admin", `ipfs://${cid}/../secret`, `ipfs://${cid}/%2e%2e/secret`, `ipfs://${cid}?redirect=x`]) expect(() => resolveIpfs(uri)).toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oversized")));
    await expect(readIpfs(`ipfs://${cid}`, 3)).rejects.toMatchObject({ status: 422 });
  });
});
