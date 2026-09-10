import { B20_FACTORY_ADDRESS, b20FactoryAbi } from "@base-b20/b20";
import { createPublicClient, http, type Address } from "viem";
import { config } from "../config.js";
import { deleteLighthouseFile, listLighthouseAnnualFiles, stageUploadNames } from "./lighthouse.js";
import { store } from "./store.js";
import { pipelineStore } from "./pipeline-store.js";
import type { PreparedMetadata } from "./ipfs.js";

export const CLEANUP_GRACE_MS = 3600_000;
const client = createPublicClient({ transport: http(config.BASE_RPC_URL, { timeout: 12_000, retryCount: 1 }) });

/** Only called after discovery has verified no initialization at a safe block after expiry. */
export async function cleanupAbandonedMetadata(stageId: string): Promise<boolean> {
  return store.withPublicationLock(async () => {
    const stage = await store.getMetadataStage(stageId);
    if (!stage || stage.status === "committed" || stage.cleanupState === "complete") return true;
    if (Date.now() < Date.parse(stage.expiresAt) + CLEANUP_GRACE_MS) return false;
    if (!stage.binding || stage.status !== "publishing") throw new Error("Cleanup requires a bound publication");
    const launch = await store.getLaunch(stage.binding.idempotencyKey);
    if (!launch) throw new Error("Cleanup launch evidence missing");
    const safe = await client.getBlock({ blockTag: "safe" });
    if (Number(safe.timestamp) * 1000 < Date.parse(stage.expiresAt) + CLEANUP_GRACE_MS) return false;
    // Check both the stable chain and the latest sequencer state. Any RPC error
    // or initialized token preserves its files. Never infer failure from age.
    for (const blockTag of ["safe", "latest"] as const) {
      const initialized = await client.readContract({ address: B20_FACTORY_ADDRESS, abi: b20FactoryAbi,
        functionName: "isB20Initialized", args: [launch.predictedToken as Address], blockTag });
      if (initialized !== false) throw new Error("Token may be live; cleanup deferred");
    }
    if (!config.LIGHTHOUSE_API_KEY) throw new Error("Storage cleanup credential unavailable");
    // Persist the fence before any network mutation. A timeout/crash leaves a
    // retryable tombstone; new publications cannot reuse a deleting asset.
    await store.setMetadataCleanup(stageId, "pending");
    const prepared = stage.prepared as PreparedMetadata;
    const names = stageUploadNames(stageId);
    const files = await listLighthouseAnnualFiles(config.LIGHTHOUSE_API_KEY);
    const deletedIds = new Set<string>();
    const retainedIds = new Set<string>();
    const journalKey = `cleanup:${stageId}`;
    const prior = await pipelineStore.readState(journalKey);
    const attemptedIds = new Set<string>(prior ? (JSON.parse(prior) as { attemptedIds: string[] }).attemptedIds : []);
    let waitingForSharedLaunch = false;
    for (const key of ["logo", "contract"] as const) {
      const asset = prepared[key];
      const owned = files.filter(file => file.cid === asset.cid && file.fileName === names[key]);
      // Never adopt legacy filenames, arbitrary account files, or permanent
      // storage. Namespace + CID must both match a server-generated stage.
      if (!owned.length) continue;
      const refs = await store.metadataReferences(asset.cid, stageId);
      const knownNames = new Set(refs.map(ref => stageUploadNames(ref.stageId)[key]));
      const unknownSharedFile = files.some(file => file.cid === asset.cid && file.fileName !== names[key] && !knownNames.has(file.fileName));
      if (unknownSharedFile || refs.some(ref => ref.status === "committed" || ref.txHash) || await pipelineStore.referencesCid(asset.cid)) {
        for (const file of owned) retainedIds.add(file.id);
        continue;
      }
      if (refs.some(ref => !ref.cleanupState)) { waitingForSharedLaunch = true; continue; }
      for (const file of owned) {
        attemptedIds.add(file.id);
        await pipelineStore.writeState(journalKey, JSON.stringify({ state: "pending", attemptedIds: [...attemptedIds] }));
        await deleteLighthouseFile(file.id, config.LIGHTHOUSE_API_KEY);
        deletedIds.add(file.id);
      }
    }
    if (deletedIds.size) {
      const remaining = await listLighthouseAnnualFiles(config.LIGHTHOUSE_API_KEY);
      if (remaining.some(file => deletedIds.has(file.id))) throw new Error("Provider deletion is still propagating");
    }
    if (waitingForSharedLaunch) return false;
    await pipelineStore.writeState(journalKey, JSON.stringify({ state: "complete", attemptedIds: [...attemptedIds],
      retainedSharedIds: [...retainedIds], verifiedAt: new Date().toISOString() }));
    await store.setMetadataCleanup(stageId, "complete");
    return true;
  });
}
