import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import lighthouse from "@lighthouse-web3/sdk";
import Hash from "ipfs-only-hash";
import sharp from "sharp";
import { createPublicClient, getAddress, http, isHash, type Address, type Hex } from "viem";
import { z } from "zod";

import { buildContractMetadata, type ContractMetadata } from "@base-b20/b20";

import { config } from "../config.js";
import { ApiError } from "../lib/http.js";
import { store, type MetadataStageRecord } from "./store.js";

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
    status: "staged" | "committed";
    verified: boolean;
    uploadedAt?: string;
  };
};

type LighthouseUploadResponse = {
  data?: { Hash?: string; Size?: string | number };
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
  expected: IpfsObject,
  reportedSize?: string | number | undefined
): IpfsObject {
  const parsedSize = Number(reportedSize ?? expected.size);
  return {
    ...expected,
    size: Number.isFinite(parsedSize) ? parsedSize : expected.size,
    provider: "lighthouse"
  };
}

async function uploadBuffer(buffer: Buffer, expected: IpfsObject): Promise<IpfsObject> {
  try {
    const response = (await lighthouse.uploadBuffer(buffer, requireApiKey(), {
      cidVersion: 1
    })) as LighthouseUploadResponse;
    const cid = response.data?.Hash;
    if (!cid) throw new ApiError("Lighthouse did not return a CID for the token logo.", 502);
    if (cid !== expected.cid) throw new ApiError("Lighthouse logo CID did not match the staged CID.", 502);
    return committedIpfsObject(expected, response.data?.Size);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Lighthouse could not store the token logo. Please retry.", 502);
  }
}

async function uploadJson(body: string, expected: IpfsObject): Promise<IpfsObject> {
  try {
    const response = (await lighthouse.uploadText(body, requireApiKey(), "b20-contract-metadata.json", {
      cidVersion: 1
    })) as LighthouseUploadResponse;
    const cid = response.data?.Hash;
    if (!cid) throw new ApiError("Lighthouse did not return a CID for contract metadata.", 502);
    if (cid !== expected.cid) throw new ApiError("Lighthouse metadata CID did not match the staged CID.", 502);
    return committedIpfsObject(expected, response.data?.Size);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Lighthouse could not store contract metadata. Please retry.", 502);
  }
}

async function checkGateway(url: string): Promise<GatewayHealth> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(5000)
    });
    return { url, ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch {
    return { url, ok: false, ms: Date.now() - started };
  }
}

async function verifyGateways(objects: IpfsObject[]): Promise<GatewayHealth[]> {
  let health: GatewayHealth[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    health = await Promise.all(objects.flatMap((object) => object.gatewayUrls).map(checkGateway));
    const lighthouseChecks = objects.map((object) => health.find((item) => item.url === object.gatewayUrls[0]));
    if (lighthouseChecks.every((item) => item?.ok)) return health;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  return health;
}

async function normalizeLogo(file?: Express.Multer.File): Promise<Buffer> {
  if (!file) throw new ApiError("A token logo is required.", 400);
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
    throw new ApiError("Logo must be PNG, JPEG, or WebP.", 400);
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new ApiError("Logo must be 1 MB or smaller.", 400);
  }

  let normalized: Buffer;
  try {
    const metadata = await sharp(file.buffer).metadata();
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

async function getStage(stageId: string): Promise<MetadataStageRecord<PreparedMetadata>> {
  const stage = (await store.getMetadataStage(stageId)) as MetadataStageRecord<PreparedMetadata> | undefined;
  if (!stage) throw new ApiError("Metadata stage was not found or has expired.", 404);
  if (Date.now() >= Date.parse(stage.expiresAt) && stage.status !== "committed") {
    await store.deleteMetadataStage(stageId);
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
        throw new ApiError("The B20 launch transaction reverted. Metadata was not published.", 409);
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
  file?: Express.Multer.File
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
    await store.deleteMetadataStage(stage.stageId);
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
  const stage = await getStage(parsed.stageId);
  if (stage.status === "committed") return stage.prepared;
  if (!stageTokenMatches(parsed.stageToken, stage.secretHash)) {
    throw new ApiError("The metadata stage token is invalid.", 403);
  }
  if (!stage.binding || stage.binding.idempotencyKey !== parsed.idempotencyKey) {
    throw new ApiError("Metadata stage is not bound to this launch transaction.", 409);
  }

  const transaction = await findTransaction(parsed.txHash as Hex);
  if (!transaction.to || getAddress(transaction.to) !== getAddress(stage.binding.to)) {
    throw new ApiError("Transaction target does not match the staged launch router.", 409);
  }
  if (transaction.input.toLowerCase() !== stage.binding.attributedData.toLowerCase()) {
    throw new ApiError("Transaction calldata does not match the staged launch package.", 409);
  }
  const receipt = await findSuccessfulReceipt(parsed.txHash as Hex);
  if (receipt.transactionHash.toLowerCase() !== parsed.txHash.toLowerCase()) {
    throw new ApiError("Transaction receipt verification failed.", 409);
  }
  if (!stage.logoBody || !stage.contractBody) {
    throw new ApiError("Staged metadata bytes are unavailable. Contact support before retrying.", 409);
  }

  await store.markMetadataPublishing(stage.stageId, parsed.txHash as Hex);

  const logo = await uploadBuffer(stage.logoBody, stage.prepared.logo);
  const contract = await uploadJson(stage.contractBody, stage.prepared.contract);
  const gatewayHealth = await verifyGateways([logo, contract]);
  const verified = [logo.gatewayUrls[0], contract.gatewayUrls[0]].every(
    (url) => gatewayHealth.find((item) => item.url === url)?.ok === true
  );
  if (!verified) {
    throw new ApiError("Metadata is stored, but Lighthouse gateway verification is pending. Retry shortly.", 503);
  }

  const committed: PreparedMetadata = {
    ...stage.prepared,
    logo,
    contract,
    gatewayHealth,
    storage: {
      provider: "Lighthouse",
      network: "IPFS + Filecoin",
      status: "committed",
      verified: true,
      uploadedAt: new Date().toISOString()
    }
  };
  await store.completeMetadataStage(stage.stageId, committed, parsed.txHash as Hex);
  return committed;
}
