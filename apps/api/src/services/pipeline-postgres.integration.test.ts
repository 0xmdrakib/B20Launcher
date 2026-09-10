import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { PipelineStore } from "./pipeline-store.js";
import { PostgresStore } from "./store.js";

// Opt-in only; use an isolated Neon branch. Never run this against production.
const url = process.env.B20_TEST_DATABASE_URL;
describe.skipIf(!url)("Neon pipeline integration", () => {
  it("migrates idempotently and coordinates two independent workers", async () => {
    const first = new PipelineStore(url), second = new PipelineStore(url);
    const stages = new PostgresStore(url!);
    try {
      await stages.initialize(); await stages.initialize();
      await Promise.all([first.initialize(), second.initialize()]);
      const id = `test:${randomUUID()}`;
      await first.enqueue(id, "token", { test: true });
      const claims = await Promise.all([first.claim(id), second.claim(id)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const job = claims.find(Boolean)!;
      const address = randomUUID();
      await first.saveSnapshot(address, { name: "First" }, job);
      const initial = (await second.getSnapshot(address))!;
      await second.saveSnapshot(address, { name: "First" }, job);
      expect((await first.getSnapshot(address))!.revision).toBe(initial.revision);
      await second.saveSnapshot(address, { name: "Updated" }, job);
      const changes = await first.listChanges(initial.revision, 100);
      expect(changes.some(change => change.address === address && change.token.name === "Updated")).toBe(true);
      await first.finish(job, null);
      await expect(second.saveSnapshot(address, { name: "Stale" }, job)).rejects.toThrow("lease expired");
      const stageId = randomUUID();
      await stages.saveMetadataStage({ stageId, secretHash: "test", contractUri: "ipfs://test", expiresAt: new Date(Date.now()+60000).toISOString(), prepared: {}, status: "staged" });
      const binding = { idempotencyKey: id, to: "0x1111111111111111111111111111111111111111" as const, attributedData: "0x1234" as const };
      await stages.bindMetadataStage(stageId, binding);
      expect(await stages.armMetadataPublication(stageId, "wrong-launch", "0x1234")).toBe(false);
      expect(await stages.armMetadataPublication(stageId, id, "0xabcd")).toBe(false);
      expect(await stages.armMetadataPublication(stageId, id, "0x1234")).toBe(true);
      await expect(stages.bindMetadataStage(stageId, { ...binding, attributedData: "0xabcd" })).rejects.toMatchObject({ status: 409 });
    } finally { await Promise.all([first.close(), second.close(), stages.close()]); }
  }, 60_000);
});
