import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";

/**
 * Create the authenticated Coinbase CDP facilitator client used by every
 * x402 server surface in this workspace.
 *
 * The CDP SDK reads CDP_API_KEY_ID and CDP_API_KEY_SECRET from the server
 * environment and signs the short-lived authentication requests internally.
 * Neither credential is returned from this function or included in responses.
 */
export function createB20CdpFacilitatorClient() {
  const missing = ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET"].filter(
    (key) => !process.env[key]?.trim()
  );

  if (missing.length > 0) {
    throw new Error(`Missing Coinbase CDP facilitator credentials: ${missing.join(", ")}`);
  }

  return createCdpFacilitatorClient();
}
