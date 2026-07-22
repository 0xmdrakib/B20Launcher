import { queryRecentB20Creations } from "@base-b20/api/core";
import { NextRequest } from "next/server";

import { apiRoute } from "../../../../src/server/api-route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return apiRoute(request, async () => queryRecentB20Creations(25));
}
