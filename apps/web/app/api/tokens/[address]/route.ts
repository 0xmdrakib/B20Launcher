import { getPublicToken } from "@base-b20/api/core";
import { type NextRequest } from "next/server";
import { publicTokenRoute } from "../../../../src/server/public-token-route";

export const runtime = "nodejs";
export { publicTokenOptions as OPTIONS } from "../../../../src/server/public-token-route";

export async function GET(request: NextRequest, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  return publicTokenRoute(request, () => getPublicToken(address));
}
