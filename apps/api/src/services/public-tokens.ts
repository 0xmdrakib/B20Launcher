import { createHash } from "node:crypto";

import { b20LaunchRouterAbi, contractMetadataSchema, predictB20Address } from "@base-b20/b20";
import { decodeFunctionData, getAddress, isAddress } from "viem";
import { z } from "zod";

import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";
import { store, type PublishedTokenSource } from "./store.js";

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

export type PublicToken = ReturnType<typeof projectPublishedToken>;

export async function getPublicToken(address: string) {
  addressSchema.parse(address);
  const [source] = await store.getPublishedTokens({ address, limit: 1 });
  if (!source) throw new ApiError("Published token not found.", 404);
  return projectPublishedToken(source);
}

export async function listPublicTokens(input: { limit?: string | number; after?: string } = {}) {
  const { limit, after } = pageSchema.parse(input);
  const sources = await store.getPublishedTokens({ limit: limit + 1, ...(after ? { after } : {}) });
  const tokens = sources.slice(0, limit).map(projectPublishedToken);
  return {
    chainId: config.BASE_CHAIN_ID,
    tokens,
    nextCursor: sources.length > limit ? tokens.at(-1)!.address.toLowerCase() : null
  };
}

export async function recentPublicTokens() {
  const tokens = (await store.getPublishedTokens()).map(projectPublishedToken);
  return {
    source: "confirmed-launches",
    rows: tokens.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 20)
  };
}

export async function publicTokenList() {
  const records = (await store.getPublishedTokens()).map(projectPublishedToken);
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
  const timestamp = records.reduce((latest, token) => token.publishedAt > latest ? token.publishedAt : latest, "1970-01-01T00:00:00.000Z");
  return {
    name: "B20 Launcher",
    timestamp,
    version: { major: 1, minor: tokens.length, patch: 0 },
    keywords: ["base", "b20"],
    tokens
  };
}

export async function getPublicLogo(address: string) {
  const token = await getPublicToken(address);
  try {
    const response = await fetch(token.logoURI, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) {
      throw new Error("Logo unavailable");
    }
    if (Number(response.headers.get("content-length") ?? 0) > 1_000_000 || !response.body) {
      throw new Error("Invalid logo response");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) { await reader.cancel(); throw new Error("Logo too large"); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    if (createHash("sha256").update(body).digest("hex") !== token.logoSha256) throw new Error("Logo hash mismatch");
    return { body, etag: `"${token.logoSha256}"` };
  } catch {
    throw new ApiError("Token logo is temporarily unavailable. Retry shortly.", 502);
  }
}
