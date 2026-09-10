import { authorizeIndexer, runTokenIndexer } from "@base-b20/api/core";
import { type NextRequest } from "next/server";
import { apiRoute } from "../../../../src/server/api-route";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  return apiRoute(request, async () => {
    await authorizeIndexer(request.headers.get("authorization"));
    return runTokenIndexer({ budgetMs: 40_000, maxJobs: 20 });
  });
}
