import { NextRequest } from "next/server";

import { recentPublicTokens } from "@base-b20/api/core";
import { publicTokenRoute } from "../../../../src/server/public-token-route";

export const runtime = "nodejs";
export { publicTokenOptions as OPTIONS } from "../../../../src/server/public-token-route";

export async function GET(request: NextRequest) {
  return publicTokenRoute(request, recentPublicTokens);
}
