const LEGACY_DEDICATED_SUFFIX = ".lighthouse.storage";
const CURRENT_DEDICATED_SUFFIX = ".lighthouseweb3.xyz";
const SHARED_GATEWAY_HOST = "gateway.lighthouse.storage";

export function normalizeLighthouseGatewayUrl(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();

  if (hostname !== SHARED_GATEWAY_HOST && hostname.endsWith(LEGACY_DEDICATED_SUFFIX)) {
    const subdomain = hostname.slice(0, -LEGACY_DEDICATED_SUFFIX.length);
    url.hostname = `${subdomain}${CURRENT_DEDICATED_SUFFIX}`;
  }

  return url.toString().replace(/\/$/, "");
}
