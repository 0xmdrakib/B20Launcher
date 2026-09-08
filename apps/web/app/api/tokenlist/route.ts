import { publicTokenList } from "@base-b20/api/core";
import { type NextRequest } from "next/server";
import { publicTokenRoute } from "../../../src/server/public-token-route";

export const runtime = "nodejs";
export { publicTokenOptions as OPTIONS } from "../../../src/server/public-token-route";

export async function GET(request: NextRequest) {
  return publicTokenRoute(request, publicTokenList);
}
