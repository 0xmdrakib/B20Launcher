import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiRoute } from "./api-route";

export function publicTokenOptions() {
  return new NextResponse(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Max-Age": "86400"
  } });
}

export async function publicTokenRoute(request: NextRequest, handler: () => Promise<unknown>) {
  const response = await apiRoute(request, handler, { noStore: false });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Expose-Headers", "ETag, Link");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (!response.ok) {
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  response.headers.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  const etag = `"${createHash("sha256").update(await response.clone().text()).digest("hex")}"`;
  response.headers.set("ETag", etag);
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: response.headers });
  return response;
}
