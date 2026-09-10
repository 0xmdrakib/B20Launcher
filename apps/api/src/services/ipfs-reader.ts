import { createHash } from "node:crypto";
import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";

// All metadata-controlled URLs are resolved through the configured HTTPS IPFS
// gateway. No arbitrary fetches, redirects, credentials, or traversal paths.
export function resolveIpfs(uri: string): string {
  const prefix = `${config.LIGHTHOUSE_GATEWAY_URL.replace(/\/$/, "")}/`;
  const path = uri.startsWith("ipfs://") ? uri.slice(7) : uri.startsWith(prefix) ? uri.slice(prefix.length) : "";
  if (!/^(?:b[a-z2-7]{20,119}|Qm[1-9A-HJ-NP-Za-km-z]{44})(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127})*$/.test(path)
    || path.split("/").some(part => part === "." || part === "..")) {
    throw new ApiError("Use an IPFS URI or the configured IPFS gateway for public token metadata.", 422);
  }
  return prefix + path;
}

export async function readIpfs(uri: string, maxBytes: number, expectedSha256?: string) {
  const primary = resolveIpfs(uri);
  const path = primary.slice(config.LIGHTHOUSE_GATEWAY_URL.replace(/\/$/, "").length + 1);
  let firstError: unknown;
  for (const url of [primary, `https://ipfs.io/ipfs/${path}`]) {
    try { return await readGateway(url, maxBytes, expectedSha256); }
    catch (error) { firstError ??= error; }
  }
  throw firstError;
}

async function readGateway(url: string, maxBytes: number, expectedSha256?: string) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(12_000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length") ?? 0) > maxBytes) {
    throw new ApiError("IPFS content is not available at the gateway yet.", 502, { upstreamStatus: response.status, url, contentLength: response.headers.get("content-length"), maxBytes });
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new ApiError("IPFS content exceeds the size limit.", 422);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const body = Buffer.concat(chunks);
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (expectedSha256 && sha256 !== expectedSha256) throw new ApiError("IPFS content verification failed.", 502);
  return { body, sha256, url, contentType: response.headers.get("content-type") ?? "" };
}
