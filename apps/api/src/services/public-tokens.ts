import { createHash } from "node:crypto";

import { b20LaunchRouterAbi, contractMetadataSchema, predictB20Address } from "@base-b20/b20";
import { decodeFunctionData, getAddress, isAddress } from "viem";
import { z } from "zod";

import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";
import { store, type PublishedTokenSource } from "./store.js";
import { pipelineStore } from "./pipeline-store.js";
import { readIpfs } from "./ipfs-reader.js";
import sharp from "sharp";

const cidSchema = z.string().regex(/^bafybei[a-z2-7]{52}$/);
const publishedSchema = z.object({
  metadata: contractMetadataSchema,
  contract: z.object({ cid: cidSchema, uri: z.string() }),
  logo: z.object({ cid: cidSchema, uri: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  storage: z.object({ status: z.literal("committed"), verified: z.literal(true) })
});
const addressSchema = z.string().refine((value) => isAddress(value, { strict: false }), "Invalid token address");
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  after: addressSchema.optional()
});

function ipfsUrl(cid: string) {
  return `${config.LIGHTHOUSE_GATEWAY_URL.replace(/\/$/, "")}/${cidSchema.parse(cid)}`;
}

// Only this explicit projection may cross the public API boundary. Source records
// are internal and must never be returned directly, even after publication.
export function projectPublishedToken(source: PublishedTokenSource) {
  const parsed = publishedSchema.safeParse(source.prepared);
  if (!parsed.success) throw new ApiError("Published token record failed verification.", 503);
  const published = parsed.data;
  const launch = decodeFunctionData({ abi: b20LaunchRouterAbi, data: source.launchData });
  const args = launch.args[0];
  const variant = launch.functionName === "launchAsset" ? "asset" : "stablecoin";
  const address = predictB20Address({ variant, creator: source.router, salt: args.common.salt });
  if (
    address.toLowerCase() !== source.address.toLowerCase() ||
    args.common.contractURI !== source.contractUri ||
    published.contract.uri !== source.contractUri ||
    published.contract.uri !== `ipfs://${published.contract.cid}` ||
    published.logo.uri !== `ipfs://${published.logo.cid}` ||
    published.metadata.image !== published.logo.uri
  ) throw new ApiError("Published token record failed verification.", 503);

  return {
    chainId: config.BASE_CHAIN_ID,
    address: getAddress(address),
    name: args.common.name,
    symbol: args.common.symbol,
    decimals: launch.functionName === "launchAsset" ? launch.args[0].decimals : 6,
    variant,
    description: published.metadata.description ?? "",
    website: published.metadata.external_link ?? null,
    logoURI: ipfsUrl(published.logo.cid),
    image: ipfsUrl(published.logo.cid),
    imageIpfs: published.logo.uri,
    logoSha256: published.logo.sha256,
    contractURI: published.contract.uri,
    metadataURI: ipfsUrl(published.contract.cid),
    metadata: published.metadata,
    transactionHash: source.transactionHash,
    publishedAt: source.publishedAt,
    metadataSource: "confirmed-launch" as const
  };
}

export type PublicToken = Omit<ReturnType<typeof projectPublishedToken>, "metadataSource"> & {
  metadataSource: "confirmed-launch" | "onchain-contractURI";
  revision?: number; updatedAt?: string;
};

async function currentToken(source: PublishedTokenSource): Promise<PublicToken> {
  const original = projectPublishedToken(source);
  const snapshot = await pipelineStore.getSnapshot(original.address);
  return snapshot ? { ...snapshot.document, revision: snapshot.revision, updatedAt: snapshot.updatedAt } as PublicToken : original;
}

async function currentTokens(sources: PublishedTokenSource[]): Promise<PublicToken[]> {
  const originals = sources.map(projectPublishedToken);
  const snapshots = await pipelineStore.getSnapshots(originals.map(token => token.address));
  return originals.map(original => {
    const snapshot = snapshots.get(original.address.toLowerCase());
    return snapshot ? { ...snapshot.document, revision: snapshot.revision, updatedAt: snapshot.updatedAt } as PublicToken : original;
  });
}

export async function getPublicToken(address: string) {
  addressSchema.parse(address);
  const [source] = await store.getPublishedTokens({ address, limit: 1 });
  if (!source) throw new ApiError("Published token not found.", 404);
  return currentToken(source);
}

export async function listPublicTokens(input: { limit?: string | number; after?: string } = {}) {
  const { limit, after } = pageSchema.parse(input);
  const sources = await store.getPublishedTokens({ limit: limit + 1, ...(after ? { after } : {}) });
  const tokens = await currentTokens(sources.slice(0, limit));
  return {
    chainId: config.BASE_CHAIN_ID,
    tokens,
    nextCursor: sources.length > limit ? tokens.at(-1)!.address.toLowerCase() : null
  };
}

export async function recentPublicTokens() {
  const tokens = await currentTokens(await store.getPublishedTokens());
  return {
    source: "confirmed-launches",
    rows: tokens.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 20)
  };
}

export async function publicTokenList() {
  const records = await currentTokens(await store.getPublishedTokens({ limit: 10_001 }));
  if (!records.length) throw new ApiError("No published tokens yet.", 404);
  if (records.length > 10_000) throw new ApiError("Use the paginated /api/tokens feed for this catalogue.", 413);
  const tokens = records.map(({ chainId, address, name, symbol, decimals, logoURI }) => {
    const listName = [...name.replace(/\s/g, " ")].slice(0, 60).join("");
    const listSymbol = [...symbol].slice(0, 20).join("");
    return {
      chainId, address, name: listName, symbol: listSymbol, decimals, logoURI,
      ...(listName !== name || listSymbol !== symbol ? { extensions: { originalName: name, originalSymbol: symbol } } : {})
    };
  });
  const timestamp = records.reduce((latest, token) => (token.updatedAt ?? token.publishedAt) > latest ? (token.updatedAt ?? token.publishedAt) : latest, "1970-01-01T00:00:00.000Z");
  return {
    name: "B20 Launcher",
    timestamp,
    version: await pipelineStore.tokenListVersion(tokens),
    keywords: ["base", "b20"],
    tokens
  };
}

export async function getPublicLogo(address: string) {
  const token = await getPublicToken(address);
  try {
    const image = await readIpfs(token.imageIpfs, 1_000_000, token.logoSha256);
    const format = (await sharp(image.body, { limitInputPixels: 16_777_216 }).metadata()).format;
    if (!["png", "jpeg", "webp"].includes(format ?? "")) throw new Error("Unsupported logo format");
    const body = format === "png" ? image.body : await sharp(image.body, { limitInputPixels: 16_777_216 }).resize(512, 512, { fit: "contain", background: "#00000000" }).png().toBuffer();
    return { body, etag: `"${createHash("sha256").update(body).digest("hex")}"` };
  } catch {
    throw new ApiError("Token logo is temporarily unavailable. Retry shortly.", 502);
  }
}

export async function publicTokenChanges(input: { after?: string; limit?: string } = {}) {
  const after = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0).parse(input.after);
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(input.limit);
  const changes = await pipelineStore.listChanges(after, limit + 1);
  const page = changes.slice(0, limit);
  return { chainId: config.BASE_CHAIN_ID, changes: page, nextCursor: page.at(-1)?.revision ?? after, hasMore: changes.length > limit };
}
