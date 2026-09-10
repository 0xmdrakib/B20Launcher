import { publicationChallenge } from "@base-b20/api/core";
import { type NextRequest } from "next/server";
import { apiRoute } from "../../../../src/server/api-route";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return apiRoute(request, async () => publicationChallenge(await request.json()), {
    rateLimit: { scope: "metadata-challenge", limit: 20, windowMs: 600_000 }
  });
}
