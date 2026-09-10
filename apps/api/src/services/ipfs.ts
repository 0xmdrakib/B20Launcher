import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import Hash from "ipfs-only-hash";
import sharp from "sharp";
import { createPublicClient, getAddress, http, isHash, isAddress, keccak256, type Address, type Hex } from "viem";
import { z } from "zod";

import { buildContractMetadata, type ContractMetadata } from "@base-b20/b20";

import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";
import { stageUploadNames, uploadToLighthouse } from "./lighthouse.js";
import { store, type MetadataStageRecord } from "./store.js";
import { readIpfs } from "./ipfs-reader.js";
import { pipelineStore } from "./pipeline-store.js";

const metadataPrepareSchema = z.object({
  name: z.string().trim().min(1).max(128),
  symbol: z.string().trim().min(1).max(32),
  description: z.string().trim().max(2000).optional().default(""),
  externalLink: z.string().url().optional().or(z.literal("")).default(""),
  variant: z.enum(["asset", "stablecoin"]).default("asset")
});

const metadataCommitSchema = z.object({
  stageId: z.string().uuid(),
  stageToken: z.string().min(32).max(256),
  idempotencyKey: z.string().min(1).max(256),
  txHash: z.string().refine((value) => isHash(value), "Invalid transaction hash")
});

export type MetadataPrepareInput = z.input<typeof metadataPrepareSchema>;
export type MetadataCommitInput = z.input<typeof metadataCommitSchema>;

export type IpfsObject = {
  cid: string;
  uri: string;
  gatewayUrls: string[];
  sha256: string;
  mimeType: string;
  size: number;
  provider: "staged" | "lighthouse";
};

export type GatewayHealth = {
  url: string;
  ok: boolean;
  status?: number;
  ms: number;
};

export type PreparedMetadata = {
  stageId: string;
  stageToken?: string | undefined;
  expiresAt: string;
  logo: IpfsObject;
  metadata: ContractMetadata;
  contract: IpfsObject;
  gatewayHealth: GatewayHealth[];
  storage: {
    provider: "Lighthouse";
    network: "IPFS + Filecoin";
    status: "staged" | "ready" | "committed";
    verified: boolean;
    uploadedAt?: string;
  };
};

export const MAX_LOGO_BYTES = 1_000_000;
const STAGE_TTL_MS = 30 * 60 * 1000;
const publicClient = createPublicClient({ transport: http(config.BASE_RPC_URL) });

function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function hashStageToken(token: string): string {
  return sha256(token);
}

function stageTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashStageToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function gatewayUrls(cid: string): string[] {
  const primary = `${config.LIGHTHOUSE_GATEWAY_URL.replace(/\/$/, "")}/${cid}`;
  return [primary, `https://ipfs.io/ipfs/${cid}`];
}

function requireApiKey(): string {
  if (!config.LIGHTHOUSE_API_KEY) {
    throw new ApiError("Lighthouse Storage is not configured. Set LIGHTHOUSE_API_KEY before launching.", 503);
  }
  return config.LIGHTHOUSE_API_KEY;
}

function stagedIpfsObject(cid: string, body: Buffer | string, mimeType: string): IpfsObject {
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrls: gatewayUrls(cid),
    sha256: sha256(body),
    mimeType,
    size: typeof body === "string" ? Buffer.byteLength(body) : body.length,
    provider: "staged"
  };
}

function committedIpfsObject(
  expected: IpfsObject
): IpfsObject {
  return {
    ...expected,
    provider: "lighthouse"
  };
}

async function uploadBuffer(buffer: Buffer, expected: IpfsObject, filename: string): Promise<IpfsObject> {
  try {
    const response = await uploadToLighthouse(buffer, filename, requireApiKey());
    const cid = response.Hash;
    if (cid !== expected.cid) throw new ApiError("Lighthouse logo CID did not match the staged CID.", 502);
    return committedIpfsObject(expected);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Lighthouse could not store the token logo. Please retry.", 502);
  }
}

async function uploadJson(body: string, expected: IpfsObject, filename: string): Promise<IpfsObject> {
  try {
    const response = await uploadToLighthouse(body, filename, requireApiKey());
    const cid = response.Hash;
    if (cid !== expected.cid) throw new ApiError("Lighthouse metadata CID did not match the staged CID.", 502);
    return committedIpfsObject(expected);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Lighthouse could not store contract metadata. Please retry.", 502);
  }
}

export type UploadedLogo = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

async function normalizeLogo(file?: UploadedLogo): Promise<Buffer> {
  if (!file) throw new ApiError("A token logo is required.", 400);
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
    throw new ApiError("Logo must be PNG, JPEG, or WebP.", 400);
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new ApiError("Logo must be 1 MB or smaller.", 400);
  }

  let normalized: Buffer;
  try {
    const metadata = await sharp(file.buffer, { limitInputPixels: 16_777_216 }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 128 || metadata.height < 128) {
      throw new ApiError("Logo must be at least 128 x 128 pixels.", 400);
    }
    normalized = await sharp(file.buffer)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toBuffer();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Logo could not be decoded as a valid image.", 400);
  }

  if (normalized.length > MAX_LOGO_BYTES) {
    normalized = await sharp(normalized)
      .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
      .toBuffer();
  }
  if (normalized.length > MAX_LOGO_BYTES) {
    throw new ApiError("The optimized logo exceeds 1 MB. Use a simpler image.", 400);
  }
  return normalized;
}

async function getStage(stageId: string, allowExpired = false): Promise<MetadataStageRecord<PreparedMetadata>> {
  const stage = (await store.getMetadataStage(stageId)) as MetadataStageRecord<PreparedMetadata> | undefined;
  if (!stage) throw new ApiError("Metadata stage was not found or has expired.", 404);
  if (stage.cleanupState && !(allowExpired && stage.cleanupState === "pending")) throw new ApiError("This launch expired. Prepare the logo again.", 410);
  if (!allowExpired && Date.now() >= Date.parse(stage.expiresAt) && stage.status !== "committed") {
    // Published stages contain the evidence needed to protect live tokens and
    // clean partial uploads. Only the reconciliation worker may retire them.
    throw new ApiError("Metadata stage has expired. Prepare the logo again.", 410);
  }
  return stage;
}

async function findTransaction(hash: Hex) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await publicClient.getTransaction({ hash });
    } catch {
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  throw new ApiError("Transaction is not visible on Base yet. Retry metadata publication.", 409);
}

async function findSuccessfulReceipt(hash: Hex) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new ApiError("The B20 launch transaction reverted. Your token was not created.", 409);
      }
      return receipt;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new ApiError("The launch is not confirmed on Base yet. Retry metadata publication.", 409);
}

export async function prepareMetadata(
  input: MetadataPrepareInput,
  file?: UploadedLogo
): Promise<PreparedMetadata> {
  const parsed = metadataPrepareSchema.parse(input);
  const logoBody = await normalizeLogo(file);
  const logoCid = await Hash.of(logoBody, { cidVersion: 1 });
  const logo = stagedIpfsObject(logoCid, logoBody, "image/png");

  const metadata = buildContractMetadata({
    name: parsed.name,
    symbol: parsed.symbol.toUpperCase(),
    description: parsed.description,
    image: logo.uri,
    externalLink: parsed.externalLink || undefined,
    variant: parsed.variant,
    chainId: config.BASE_CHAIN_ID,
    logoCid: logo.cid
  });
  const contractBody = JSON.stringify(metadata, null, 2);
  const contractCid = await Hash.of(contractBody, { cidVersion: 1 });
  const contract = stagedIpfsObject(contractCid, contractBody, "application/json");
  const stageId = randomUUID();
  const stageToken = randomBytes(32).toString("base64url");
  const expiresAtMs = Date.now() + STAGE_TTL_MS;
  const prepared: PreparedMetadata = {
    stageId,
    stageToken,
    expiresAt: new Date(expiresAtMs).toISOString(),
    logo,
    metadata,
    contract,
    gatewayHealth: [],
    storage: {
      provider: "Lighthouse",
      network: "IPFS + Filecoin",
      status: "staged",
      verified: false
    }
  };

  const storedPrepared = { ...prepared, stageToken: undefined };
  await store.saveMetadataStage({
    stageId,
    secretHash: hashStageToken(stageToken),
    contractUri: contract.uri,
    expiresAt: prepared.expiresAt,
    logoBody,
    contractBody,
    prepared: storedPrepared,
    status: "staged"
  });
  return prepared;
}

export async function bindMetadataStage(input: {
  stageId?: string | undefined;
  contractURI: string;
  stageToken?: string | undefined;
  idempotencyKey: string;
  to: Address;
  attributedData: Hex;
}) {
  if (!input.stageId) throw new ApiError("The metadata stage ID is missing.", 403);
  const stage = (await store.getMetadataStage(input.stageId)) as
    | MetadataStageRecord<PreparedMetadata>
    | undefined;
  if (!stage) throw new ApiError("The contractURI is not a valid platform metadata stage.", 409);
  if (stage.contractUri !== input.contractURI) {
    throw new ApiError("The metadata stage does not match this contractURI.", 409);
  }
  if (!input.stageToken || !stageTokenMatches(input.stageToken, stage.secretHash)) {
    throw new ApiError("The metadata stage token is missing or invalid.", 403);
  }
  if (Date.now() >= Date.parse(stage.expiresAt)) {
    throw new ApiError("Metadata stage has expired. Prepare the logo again.", 410);
  }
  await store.bindMetadataStage(stage.stageId, {
    idempotencyKey: input.idempotencyKey,
    to: input.to,
    attributedData: input.attributedData
  });
}

export async function commitMetadata(input: MetadataCommitInput): Promise<PreparedMetadata> {
  const parsed = metadataCommitSchema.parse(input);
  const stage = await getStage(parsed.stageId, true);
  if (stage.status === "committed") {
    if (stage.txHash?.toLowerCase() !== parsed.txHash.toLowerCase() || stage.binding?.idempotencyKey !== parsed.idempotencyKey) throw new ApiError("This stage belongs to a different confirmed launch.", 409);
    return stage.prepared;
  }
  if (!stageTokenMatches(parsed.stageToken, stage.secretHash)) {
    throw new ApiError("The metadata stage token is invalid.", 403);
  }
  if (!stage.binding || stage.binding.idempotencyKey !== parsed.idempotencyKey) {
    throw new ApiError("Metadata stage is not bound to this launch transaction.", 409);
  }
  return confirmMetadataStage(stage.stageId, parsed.txHash as Hex);
}

// Internal worker entry point. It accepts no unverified transaction or source:
// the target, exact calldata, and successful Base receipt are checked below.
export async function confirmMetadataStage(stageId: string, txHash: Hex): Promise<PreparedMetadata> {
  return store.withPublicationLock(() => confirmMetadataStageLocked(stageId, txHash));
}

async function confirmMetadataStageLocked(stageId: string, txHash: Hex): Promise<PreparedMetadata> {
  const stage = await getStage(stageId, true);
  if (stage.status === "committed") return stage.prepared;
  if (!stage.binding) throw new ApiError("Metadata is not bound to a launch.", 409);

  const transaction = await findTransaction(txHash);
  if (!transaction.to || getAddress(transaction.to) !== getAddress(stage.binding.to)) {
    throw new ApiError("Transaction target does not match the staged launch router.", 409);
  }
  if (transaction.input.toLowerCase() !== stage.binding.attributedData.toLowerCase()) {
    throw new ApiError("Transaction calldata does not match the staged launch package.", 409);
  }
  const receipt = await findSuccessfulReceipt(txHash);
  if (receipt.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
    throw new ApiError("Transaction receipt verification failed.", 409);
  }
  if (stage.cleanupState === "pending") await store.restoreMetadataPublication(stageId);
  await store.markMetadataPublishing(stage.stageId, txHash);
  const ready = await publishStageBytesLocked(stage.stageId);
  const committed: PreparedMetadata = { ...ready, storage: { ...ready.storage, status: "committed" } };
  await store.completeMetadataStage(stage.stageId, committed, txHash);
  const launch = await store.getLaunch(stage.binding.idempotencyKey);
  if (launch) await pipelineStore.enqueue(`token:${launch.predictedToken.toLowerCase()}`, "token", { address: launch.predictedToken });
  return committed;
}

export async function publishStageBytes(stageId: string): Promise<PreparedMetadata> {
  return store.withPublicationLock(() => publishStageBytesLocked(stageId));
}

async function publishStageBytesLocked(stageId: string): Promise<PreparedMetadata> {
  const stage = await getStage(stageId);
  if (stage.status === "committed" || stage.prepared.storage.status === "ready") return stage.prepared;
  for (const asset of [stage.prepared.logo, stage.prepared.contract]) {
    if ((await store.metadataReferences(asset.cid, stageId)).some(ref => ref.cleanupState === "pending")) {
      throw new ApiError("This logo is being cleaned up from an expired launch. Retry shortly.", 409);
    }
  }
  if (stage.status !== "publishing") throw new ApiError("Publication has not been authorized.", 403);
  if (!stage.logoBody || !stage.contractBody) {
    throw new ApiError("Staged metadata bytes are unavailable. Contact support before retrying.", 409);
  }

  // The UUID namespace is durable before either request starts, including when
  // an upload succeeds remotely but its response or the process is lost.
  const names = stageUploadNames(stage.stageId);
  const logo = await uploadBuffer(stage.logoBody, stage.prepared.logo, names.logo);
  const contract = await uploadJson(stage.contractBody, stage.prepared.contract, names.contract);
  const started = Date.now();
  const verified = await Promise.all([
    readIpfs(logo.uri, MAX_LOGO_BYTES, logo.sha256),
    readIpfs(contract.uri, 64_000, contract.sha256)
  ]);
  const ready: PreparedMetadata = {
    ...stage.prepared,
    logo,
    contract,
    expiresAt: stage.expiresAt,
    gatewayHealth: verified.map(item => ({ url: item.url, ok: true, status: 200, ms: Date.now() - started })),
    storage: {
      provider: "Lighthouse",
      network: "IPFS + Filecoin",
      status: "ready",
      verified: true,
      uploadedAt: new Date().toISOString()
    }
  };
  await store.savePublishedMetadata(stage.stageId, ready);
  return ready;
}

const publicationSchema = z.object({
  stageId: z.string().uuid(), stageToken: z.string().min(32).max(256),
  idempotencyKey: z.string().min(1).max(256),
  account: z.string().refine(value => isAddress(value, { strict: false })),
  deadline: z.coerce.number().int().positive().optional(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(32_770).optional()
});
export type PublicationInput = z.input<typeof publicationSchema>;

async function publicationContext(input: PublicationInput) {
  const parsed = publicationSchema.parse(input);
  const stage = await getStage(parsed.stageId);
  if (!stageTokenMatches(parsed.stageToken, stage.secretHash)) throw new ApiError("Invalid metadata stage token.", 403);
  if (!stage.binding || stage.binding.idempotencyKey !== parsed.idempotencyKey) throw new ApiError("Launch package has changed. Review it again.", 409);
  if (stage.binding.to.toLowerCase() !== config.B20_LAUNCH_ROUTER_ADDRESS.toLowerCase()) throw new ApiError("Launch router does not match this service.", 409);
  const launch = await store.getLaunch(parsed.idempotencyKey);
  if (!launch) throw new ApiError("Launch package not found.", 409);
  const deadline = parsed.deadline ?? Math.floor(Date.now()/1000) + 600;
  if (deadline * 1000 <= Date.now() || deadline * 1000 > Date.now() + 601_000) throw new ApiError("Publication approval expired. Please approve again.", 410);
  const message = [
    "B20 Launcher: publish my token logo and profile", `Origin: ${new URL(config.WEB_ORIGIN).origin}`,
    `Chain ID: ${config.BASE_CHAIN_ID}`, `Wallet: ${getAddress(parsed.account)}`,
    `Token: ${getAddress(launch.predictedToken)}`, `Router: ${getAddress(stage.binding.to)}`,
    `Logo: ${stage.prepared.logo.uri}`, `Profile: ${stage.contractUri}`,
    `Transaction data hash: ${keccak256(stage.binding.attributedData)}`,
    `Launch: ${parsed.idempotencyKey}`, `Stage: ${stage.stageId}`,
    `Expires: ${new Date(deadline * 1000).toISOString()}`,
    "If I do not launch within 24 hours, these uploads may be removed after onchain verification.",
    "I authorize public IPFS storage for this launch. This signature does not send a transaction or transfer funds."
  ].join("\n");
  return { parsed, stage, deadline, message };
}

export async function publicationChallenge(input: PublicationInput) {
  const { message, deadline } = await publicationContext(input);
  return { message, deadline };
}

export async function publishMetadata(input: PublicationInput) {
  const { parsed, stage, message } = await publicationContext(input);
  if (!parsed.signature || !await publicClient.verifyMessage({ address: getAddress(parsed.account), message, signature: parsed.signature as Hex })) {
    throw new ApiError("Wallet publication approval is invalid.", 403);
  }
  if (stage.prepared.storage.status === "ready") return stage.prepared;
  // Both budgets are durable across replicas. Charge every upload attempt,
  // including failed attempts, to bound paid storage use under repeated errors.
  const walletBudget = await store.consumeRateLimit(`publication:wallet:${parsed.account.toLowerCase()}`, config.PUBLICATION_WALLET_DAILY_LIMIT, 86400_000);
  if (!walletBudget.allowed) throw new ApiError("Daily wallet publication limit reached. Retry tomorrow.", 429);
  const globalBudget = await store.consumeRateLimit("publication:global", config.PUBLICATION_DAILY_LIMIT, 86400_000);
  if (!globalBudget.allowed) throw new ApiError("Publication capacity is temporarily full. Retry later.", 429);
  const fromBlock = (await publicClient.getBlockNumber()).toString();
  // Save recovery information before arming: a process exit between these
  // operations cannot strand paid uploads without a discovery job.
  await store.setPublicationOrigin(stage.stageId, fromBlock);
  if (!await store.armMetadataPublication(stage.stageId, parsed.idempotencyKey, stage.binding!.attributedData)) throw new ApiError("Launch package changed during approval.", 409);
  // Persist discovery BEFORE publishing or returning permission to broadcast.
  await pipelineStore.enqueue(`launch:${stage.stageId}`, "launch", { stageId: stage.stageId, fromBlock });
  await pipelineStore.enqueue(`publication:${stage.stageId}`, "publication", { stageId: stage.stageId });
  const job = await pipelineStore.claim(`publication:${stage.stageId}`);
  if (!job) throw new ApiError("Publication is already running. Retry shortly.", 409);
  try {
    const ready = await publishStageBytes(stage.stageId);
    await pipelineStore.finish(job, null);
    return ready;
  } catch (error) {
    await pipelineStore.finish(job, 60_000, job.data, "IPFS publication pending");
    throw error;
  }
}
