const LEGACY_DEDICATED_SUFFIX = ".lighthouse.storage";
const CURRENT_DEDICATED_SUFFIX = ".lighthouseweb3.xyz";
const SHARED_GATEWAY_HOST = "gateway.lighthouse.storage";
export const DEFAULT_LIGHTHOUSE_GATEWAY_URL = `https://${SHARED_GATEWAY_HOST}/ipfs`;

export function normalizeLighthouseGatewayUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname.includes("*") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/ipfs\/?$/.test(url.pathname)
  ) {
    throw new Error("LIGHTHOUSE_GATEWAY_URL must be an HTTPS /ipfs URL without credentials, query, or fragment.");
  }
  const hostname = url.hostname.toLowerCase();

  if (hostname !== SHARED_GATEWAY_HOST && hostname.endsWith(LEGACY_DEDICATED_SUFFIX)) {
    const subdomain = hostname.slice(0, -LEGACY_DEDICATED_SUFFIX.length);
    url.hostname = `${subdomain}${CURRENT_DEDICATED_SUFFIX}`;
  }

  return url.toString().replace(/\/$/, "");
}
