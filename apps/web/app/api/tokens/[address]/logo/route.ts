import { getPublicLogo } from "@base-b20/api/core";
import { NextResponse, type NextRequest } from "next/server";
import { apiRoute } from "../../../../../src/server/api-route";

export const runtime = "nodejs";
export { publicTokenOptions as OPTIONS } from "../../../../../src/server/public-token-route";

export async function GET(request: NextRequest, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  let logo: Awaited<ReturnType<typeof getPublicLogo>> | undefined;
  const result = await apiRoute(request, async () => {
    logo = await getPublicLogo(address);
    return null;
  });
  if (!logo) {
    result.headers.set("Access-Control-Allow-Origin", "*");
    result.headers.set("Cache-Control", "no-store");
    return result;
  }
  const headers = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=3600",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    "ETag": logo.etag
  };
  if (request.headers.get("if-none-match") === logo.etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(new Uint8Array(logo.body), { headers });
}
