import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const origin = "https://b20launcher.rakibhq.xyz";
const imageHosts = new Set([
  "b20launcher.rakibhq.xyz",
  "protective-walrus-h5noy.lighthouseweb3.xyz",
  "assets.geckoterminal.com",
  "coin-images.coingecko.com",
  "assets.coingecko.com",
  "cdn.dexscreener.com",
  "dd.dexscreener.com",
  "raw.githubusercontent.com"
]);
const sha256 = (body) => createHash("sha256").update(body).digest("hex");
const sameAddress = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

// Read-only checks. No keys, wallet requests, submissions, or scheduled jobs.
async function read(url, image = false) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || (image && !imageHosts.has(parsed.hostname))) {
    throw new Error("Unapproved image URL; inspect the provider URL manually.");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  const chunks = [];
  let size = 0;
  if (!response.body) throw new Error("Empty response body");
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) { await reader.cancel(); throw new Error("Response exceeded 2 MB"); }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  const type = response.headers.get("content-type") ?? "";
  return {
    url, status: response.status, type, body,
    json: type.includes("json") ? JSON.parse(body.toString()) : null
  };
}

export function extractConsumerRecord(provider, status, data, address) {
  if (status === 404) return { state: "not_indexed", imageUrls: [] };
  if (status !== 200) return { state: "request_failed", imageUrls: [] };
  if (provider === "dexscreener") {
    if (!Array.isArray(data)) return { state: "invalid_response", imageUrls: [] };
    const pairs = data.filter((p) => p.chainId === "base" &&
      (sameAddress(p.baseToken?.address, address) || sameAddress(p.quoteToken?.address, address)));
    // A pair's info.imageUrl describes its BASE token, never assume it describes
    // the requested quote token. A Base network badge is not token-logo evidence.
    const imageUrls = [...new Set(pairs.filter((p) => sameAddress(p.baseToken?.address, address))
      .map((p) => p.info?.imageUrl).filter((url) => typeof url === "string" && url.length > 0))];
    return { state: !pairs.length ? "no_indexed_pair" : imageUrls.length ? "image_reported" : "logo_missing", pairCount: pairs.length, imageUrls };
  }
  if (provider === "geckoterminal") {
    if (!sameAddress(data?.data?.attributes?.address, address) || data?.data?.id?.toLowerCase() !== `base_${address.toLowerCase()}`) {
      return { state: "identity_mismatch", imageUrls: [] };
    }
    const url = data.data.attributes.image_url;
    return { state: url ? "image_reported" : "logo_missing", imageUrls: url ? [url] : [] };
  }
  if (provider === "blockscout") {
    if (!sameAddress(data?.address_hash, address)) return { state: "identity_mismatch", imageUrls: [] };
    return { state: data.icon_url ? "image_reported" : "logo_missing", imageUrls: data.icon_url ? [data.icon_url] : [] };
  }
  throw new Error("Unknown consumer");
}

async function inspectImage(url, expectedHash) {
  try {
    const result = await read(url, true);
    const hash = sha256(result.body);
    return {
      url, httpStatus: result.status, contentType: result.type, bytes: result.body.length, sha256: hash,
      state: result.status !== 200 || !/^image\/(png|jpeg|webp)(;|$)/i.test(result.type)
        ? "unavailable"
        : hash === expectedHash ? "exact_logo_match" : "visual_review_required"
    };
  } catch (error) {
    return { url, state: "request_failed", error: error.message };
  }
}

export async function checkTokenVisibility(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("A Base token contract address is required");
  const source = await read(`${origin}/api/tokens/${address}`);
  if (source.status !== 200 || source.json?.chainId !== 8453 || !sameAddress(source.json?.address, address)) {
    throw new Error(`Published B20 token lookup failed (${source.status})`);
  }
  const token = source.json;
  const [metadata, logo, list] = await Promise.all([
    read(`${origin}/api/tokens/${address}/metadata`),
    inspectImage(`${origin}/api/tokens/${address}/logo`, token.logoSha256),
    read(`${origin}/api/tokenlist`)
  ]);
  const endpoints = {
    dexscreener: `https://api.dexscreener.com/token-pairs/v1/base/${address}`,
    geckoterminal: `https://api.geckoterminal.com/api/v2/networks/base/tokens/${address}/info`,
    blockscout: `https://base.blockscout.com/api/v2/tokens/${address}`
  };
  const consumers = {};
  for (const [provider, url] of Object.entries(endpoints)) {
    try {
      const response = await read(url);
      const record = extractConsumerRecord(provider, response.status, response.json, address);
      const images = [];
      for (const imageUrl of record.imageUrls) images.push(await inspectImage(imageUrl, token.logoSha256));
      consumers[provider] = { endpoint: url, httpStatus: response.status, ...record, images };
    } catch (error) {
      consumers[provider] = { endpoint: url, state: "request_failed", error: error.message, images: [] };
    }
  }
  const matchingListEntry = list.json?.tokens?.find((entry) => entry.chainId === 8453 && sameAddress(entry.address, address));
  return {
    checkedAt: new Date().toISOString(), chainId: 8453, address: token.address, name: token.name,
    publication: {
      metadataMatches: metadata.status === 200 && metadata.json?.image === token.imageIpfs &&
        JSON.stringify(metadata.json) === JSON.stringify(token.metadata),
      tokenListMatches: list.status === 200 && matchingListEntry?.logoURI === token.logoURI && matchingListEntry?.decimals === token.decimals,
      logo
    },
    consumers,
    exactLogoObservedInAllCheckedApis: Object.values(consumers).every((consumer) =>
      consumer.images.some((image) => image.state === "exact_logo_match")),
    manualChecksRequired: [
      "Uniswap, BaseScan, and the actual wallet UI are not covered by these APIs.",
      "Provider-resized or recompressed images require visual comparison; a different hash is not automatically a wrong logo.",
      "An API image is evidence of ingestion for this address, not proof of automatic ingestion for future launches."
    ]
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await checkTokenVisibility(process.argv[2]);
    const output = `${JSON.stringify(report, null, 2)}\n`;
    if (process.argv[3]) await writeFile(process.argv[3], output);
    console.log(output);
    // Missing consumer ingestion is a failed acceptance check, not a green build.
    if (!report.publication.metadataMatches || !report.publication.tokenListMatches ||
      report.publication.logo.state !== "exact_logo_match" || !report.exactLogoObservedInAllCheckedApis) process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
