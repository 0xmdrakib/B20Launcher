import { config, ensureStoreReady, store } from "@base-b20/api/core";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  await ensureStoreReady();
  return NextResponse.json({
    ok: true,
    chainId: config.BASE_CHAIN_ID,
    x402: config.X402_ENABLED,
    storage: {
      provider: "Lighthouse",
      configured: Boolean(config.LIGHTHOUSE_API_KEY),
      staging: store.kind
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
