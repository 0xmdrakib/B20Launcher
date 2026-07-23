import { NextRequest } from "next/server";

import { apiRoute } from "../../../../src/server/api-route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return apiRoute(request, async () => ({ source: "rpc", rows: [] }));
}
