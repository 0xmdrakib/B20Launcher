import { commitMetadata } from "@base-b20/api/core";
import { NextRequest } from "next/server";

import { apiRoute } from "../../../../src/server/api-route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return apiRoute(request, async () => commitMetadata(await request.json()), {
    rateLimit: { scope: "metadata-commit", limit: 20, windowMs: 10 * 60 * 1000 }
  });
}
