import { buildLaunchPackage } from "@base-b20/api/core";
import { NextRequest } from "next/server";

import { apiRoute, metadataAuth } from "../../../../src/server/api-route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return apiRoute(request, async () => {
    const { tx } = await buildLaunchPackage(await request.json(), metadataAuth(request));
    return tx;
  });
}
