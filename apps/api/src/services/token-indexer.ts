import { timingSafeEqual } from "node:crypto";
import { B20_FACTORY_ADDRESS, b20FactoryAbi, b20LaunchRouterAbi, contractMetadataSchema } from "@base-b20/b20";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import sharp from "sharp";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";
import { confirmMetadataStage, publishStageBytes } from "./ipfs.js";
import { readIpfs, resolveIpfs } from "./ipfs-reader.js";
import { pipelineStore, type PipelineJob } from "./pipeline-store.js";
import { projectPublishedToken } from "./public-tokens.js";
import { ensureStoreReady, store, type PublishedTokenSource } from "./store.js";
import { CLEANUP_GRACE_MS, cleanupAbandonedMetadata } from "./metadata-cleanup.js";

const client = createPublicClient({ transport: http(config.BASE_RPC_URL, { timeout: 12_000, retryCount: 2, retryDelay: 1000 }) });
const identityAbi = parseAbi([
  "function name() view returns (string)", "function symbol() view returns (string)",
  "function decimals() view returns (uint8)", "function contractURI() view returns (string)"
]);
const launchEvent = b20LaunchRouterAbi.find(item => item.type === "event" && item.name === "PlatformB20Launched")!;
const retryDelay = (attempt: number) => Math.min(3600_000, 30_000 * 2 ** Math.min(attempt, 7));

const githubKeys = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"), { timeoutDuration: 5000 });
const indexerAudience = "https://b20launcher.rakibhq.xyz/api/internal/token-indexer";
export function assertIndexerClaims(claims: JWTPayload) {
  if (claims.repository_id !== "1308824806" || claims.repository_owner_id !== "113634586"
    || claims.repository !== "0xmdrakib/B20Launcher" || claims.ref !== "refs/heads/main"
    || claims.workflow_ref !== "0xmdrakib/B20Launcher/.github/workflows/token-indexer.yml@refs/heads/main"
    || !["schedule", "workflow_dispatch"].includes(String(claims.event_name))) throw new ApiError("Unauthorized.", 401);
}

export async function authorizeIndexer(authorization: string | null | undefined) {
  if (config.CRON_SECRET.length >= 32) {
    const expected = Buffer.from(`Bearer ${config.CRON_SECRET}`), supplied = Buffer.from(authorization ?? "");
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return;
  }
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (token.length < 100 || token.length > 16_000) throw new ApiError("Unauthorized.", 401);
  try {
    const { payload } = await jwtVerify(token, githubKeys, {
      issuer: "https://token.actions.githubusercontent.com", audience: indexerAudience,
      algorithms: ["RS256"], requiredClaims: ["exp", "iat", "nbf", "jti"], maxTokenAge: "10m"
    });
    assertIndexerClaims(payload);
    if (!(await store.consumeRateLimit(`indexer-oidc:${payload.jti}`, 3, 600_000)).allowed) throw new Error("Token request budget exhausted");
  } catch { throw new ApiError("Unauthorized.", 401); }
}

async function bootstrapPublishedTokens() {
  const after = await pipelineStore.readState("bootstrap-after");
  const sources = await store.getPublishedTokens({ ...(after ? { after } : {}), limit: 50 });
  for (const source of sources) await pipelineStore.enqueue(`token:${source.address.toLowerCase()}`, "token", { address: source.address });
  await pipelineStore.writeState("bootstrap-after", sources.length === 50 ? sources.at(-1)!.address : "");
}

async function bootstrapUnfinishedPublications() {
  const after = await pipelineStore.readState("publication-bootstrap-after");
  const stages = await store.listUnfinishedPublications(after || undefined);
  for (const stage of stages) {
    if (stage.publicationFromBlock) await pipelineStore.enqueue(`launch:${stage.stageId}`, "launch", {
      stageId: stage.stageId, fromBlock: stage.publicationFromBlock
    });
    const prepared = stage.prepared as { storage?: { status?: string } };
    if (stage.publicationFromBlock && !stage.cleanupState && Date.parse(stage.expiresAt) > Date.now()
      && prepared.storage?.status !== "ready") {
      await pipelineStore.enqueue(`publication:${stage.stageId}`, "publication", { stageId: stage.stageId });
    }
  }
  await pipelineStore.writeState("publication-bootstrap-after", stages.length === 50 ? stages.at(-1)!.stageId : "");
}

export async function discoverLaunch(job: PipelineJob) {
  const stage = await store.getMetadataStage(String(job.data.stageId));
  if (!stage || stage.status === "committed" || stage.cleanupState === "complete") { await pipelineStore.finish(job, null); return; }
  if (!stage.binding) throw new Error("Launch binding missing");
  const launch = await store.getLaunch(stage.binding.idempotencyKey);
  if (!launch) throw new Error("Launch package missing");
  // Base's safe head avoids creating permanent catalogue entries from an unsafe
  // sequencer block. Failed RPC calls never advance a scan cursor.
  const safe = await client.getBlock({ blockTag: "safe" });
  const fromBlock = BigInt(String(job.data.cursor ?? job.data.fromBlock));
  const cleanupDue = Number(safe.timestamp) * 1000 >= Date.parse(stage.expiresAt) + CLEANUP_GRACE_MS;
  const initialized = await client.readContract({ address: B20_FACTORY_ADDRESS, abi: b20FactoryAbi,
    functionName: "isB20Initialized", args: [launch.predictedToken as Address], blockNumber: safe.number });
  if (initialized === false) {
    // Native initialization is irreversible. A false value at the safe head
    // proves no launch exists through that block; no historical log scan is
    // needed for abandoned intents, even after a long scheduler interruption.
    if (cleanupDue && await cleanupAbandonedMetadata(stage.stageId)) await pipelineStore.finish(job, null);
    else await pipelineStore.finish(job, 30_000, { ...job.data, cursor: (safe.number + 1n).toString() });
    return;
  }
  if (initialized !== true) throw new Error("Native initialization state unavailable");
  // Locate the first initialized block, then request only that block's logs.
  // This works with RPC plans restricting eth_getLogs to ten blocks, and costs
  // logarithmic state reads once per actual launch, not scans for every draft.
  let low = fromBlock > safe.number ? BigInt(String(job.data.fromBlock)) : fromBlock;
  let high = safe.number;
  while (low < high) {
    const middle = (low + high) / 2n;
    const exists = await client.readContract({ address: B20_FACTORY_ADDRESS, abi: b20FactoryAbi,
      functionName: "isB20Initialized", args: [launch.predictedToken as Address], blockNumber: middle });
    if (exists === true) high = middle;
    else if (exists === false) low = middle + 1n;
    else throw new Error("Historical initialization state unavailable");
  }
  const logs = await client.getLogs({ address: stage.binding.to, event: launchEvent,
    args: { token: launch.predictedToken as Address }, fromBlock: low, toBlock: low, strict: true });
  for (const log of logs) {
    if (!log.transactionHash || log.args.contractURI !== stage.contractUri) continue;
    await confirmMetadataStage(stage.stageId, log.transactionHash);
    await pipelineStore.finish(job, null);
    return;
  }
  throw new Error("Initialized token has no matching platform launch event");
}

async function sourceForJob(job: PipelineJob): Promise<PublishedTokenSource | undefined> {
  let address = job.data.address as string | undefined;
  if (!address && job.data.stageId) {
    const stage = await store.getMetadataStage(String(job.data.stageId));
    if (stage?.binding) address = (await store.getLaunch(stage.binding.idempotencyKey))?.predictedToken;
  }
  if (!address) return;
  return (await store.getPublishedTokens({ address, limit: 1 }))[0];
}

export async function reconcileToken(job: PipelineJob) {
  const source = await sourceForJob(job);
  if (!source) throw new Error("Confirmed token source unavailable");
  const original = projectPublishedToken(source);
  const safe = await client.getBlock({ blockTag: "safe" });
  const receipt = await client.getTransactionReceipt({ hash: source.transactionHash });
  if (receipt.status !== "success") throw new Error("Launch reverted");
  if (receipt.blockNumber > safe.number) { await pipelineStore.finish(job, 30_000); return; }
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (canonical.hash !== receipt.blockHash) throw new Error("Launch block is no longer canonical");
  const address = original.address;
  const initialized = await client.readContract({ address: B20_FACTORY_ADDRESS, abi: b20FactoryAbi,
    functionName: "isB20Initialized", args: [address], blockNumber: safe.number });
  if (!initialized) throw new Error("Native B20 token is not initialized");
  const [name, symbol, decimals, contractURI] = await client.multicall({
    contracts: [
      { address, abi: identityAbi, functionName: "name" },
      { address, abi: identityAbi, functionName: "symbol" },
      { address, abi: identityAbi, functionName: "decimals" },
      { address, abi: identityAbi, functionName: "contractURI" }
    ], allowFailure: false, blockNumber: safe.number,
    multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11"
  });
  if (!name || name.length > 128 || !symbol || symbol.length > 32) throw new Error("Unsupported onchain identity");
  const previous = await pipelineStore.getSnapshot(address);
  if (previous?.document.contractURI === contractURI) {
    // IPFS content is immutable. Reuse already verified bytes when the URI has
    // not changed; polling names and contractURI must not exhaust gateway quota.
    const imageUri = String(previous.document.imageIpfs);
    await pipelineStore.saveSnapshot(address, { ...previous.document, name, symbol, decimals,
      logoURI: resolveIpfs(imageUri), image: resolveIpfs(imageUri), metadataURI: resolveIpfs(contractURI) }, job);
    await pipelineStore.finish(job, config.INDEXER_INTERVAL_SECONDS * 1000,
      { address, checkedBlock: safe.number.toString(), checkedAt: new Date().toISOString() });
    return;
  }
  const prepared = source.prepared as { contract?: { sha256?: string }; logo?: { uri?: string; sha256?: string } };
  const profile = await readIpfs(contractURI, 64_000, contractURI === source.contractUri ? prepared.contract?.sha256 : undefined);
  const metadata = contractMetadataSchema.parse(JSON.parse(profile.body.toString("utf8")));
  if (!metadata.image) throw new Error("Token profile has no image");
  const image = await readIpfs(metadata.image, 1_000_000, metadata.image === prepared.logo?.uri ? prepared.logo.sha256 : undefined);
  const dimensions = await sharp(image.body, { limitInputPixels: 16_777_216 }).metadata();
  if (!["png", "jpeg", "webp"].includes(dimensions.format ?? "") || !dimensions.width || !dimensions.height) throw new Error("Unsupported logo format");
  const document = { ...original, name, symbol, decimals,
    description: metadata.description ?? "", website: metadata.external_link ?? null,
    contractURI, metadataURI: resolveIpfs(contractURI), metadata,
    logoURI: resolveIpfs(metadata.image), image: resolveIpfs(metadata.image), imageIpfs: metadata.image, logoSha256: image.sha256,
    metadataSource: "onchain-contractURI" };
  await pipelineStore.saveSnapshot(address, document, job);
  // Block progress belongs to the private job, not the public content hash;
  // unchanged metadata must not churn ETags or the incremental feed.
  await pipelineStore.finish(job, config.INDEXER_INTERVAL_SECONDS * 1000,
    { address, checkedBlock: safe.number.toString(), checkedAt: new Date().toISOString() });
}

export async function runTokenIndexer(options: { budgetMs?: number; maxJobs?: number } = {}) {
  await ensureStoreReady();
  await pipelineStore.initialize();
  await bootstrapPublishedTokens();
  await bootstrapUnfinishedPublications();
  const end = Date.now() + (options.budgetMs ?? 40_000);
  let processed = 0, failed = 0;
  while (Date.now() < end && processed < (options.maxJobs ?? 20)) {
    const job = await pipelineStore.claim();
    if (!job) break;
    processed++;
    try {
      if (job.kind === "launch") await discoverLaunch(job);
      else if (job.kind === "token") await reconcileToken(job);
      else {
        const stage = await store.getMetadataStage(String(job.data.stageId));
        if (!stage || stage.status === "committed" || stage.cleanupState || Date.parse(stage.expiresAt) <= Date.now()) {
          await pipelineStore.finish(job, null); continue;
        }
        // Publication was wallet-authorized before enqueueing. Bound automatic
        // retries; further attempts require another authenticated request.
        if (job.attempts >= 3) { await pipelineStore.finish(job, 86400_000, job.data, "Publication requires client retry"); continue; }
        const budget = await store.consumeRateLimit("publication:global", config.PUBLICATION_DAILY_LIMIT, 86400_000);
        if (!budget.allowed) throw new Error("Publication budget exhausted");
        await publishStageBytes(String(job.data.stageId));
        await pipelineStore.finish(job, null);
      }
    } catch {
      failed++;
      // Do not persist RPC bodies, signed payloads, credentials, or private URLs.
      await pipelineStore.finish(job, retryDelay(job.attempts), job.data, `${job.kind} verification pending`);
    }
  }
  await pipelineStore.writeState("last-run", new Date().toISOString());
  return { processed, failed, ...await pipelineStore.health() };
}
