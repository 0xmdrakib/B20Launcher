import { publishMetadata } from "@base-b20/api/core";
import { type NextRequest } from "next/server";
import { apiRoute } from "../../../../src/server/api-route";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  return apiRoute(request, async () => publishMetadata(await request.json()), {
    rateLimit: { scope: "metadata-publish", limit: 20, windowMs: 600_000 }
  });
}
