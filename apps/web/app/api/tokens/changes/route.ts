import { publicTokenChanges } from "@base-b20/api/core";
import { type NextRequest } from "next/server";
import { publicTokenRoute } from "../../../../src/server/public-token-route";
export const runtime = "nodejs";
export { publicTokenOptions as OPTIONS } from "../../../../src/server/public-token-route";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return publicTokenRoute(request, () => publicTokenChanges({
    ...(params.has("after") ? { after: params.get("after")! } : {}),
    ...(params.has("limit") ? { limit: params.get("limit")! } : {})
  }));
}
