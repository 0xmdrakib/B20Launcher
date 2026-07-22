import { getB20Status, ApiError } from "@base-b20/api/core";
import { getAddress, isAddress } from "viem";
import { NextRequest } from "next/server";

import { apiRoute } from "../../../../../src/server/api-route";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  return apiRoute(request, async () => {
    const { address } = await context.params;
    if (!isAddress(address)) throw new ApiError("A valid B20 token address is required.", 400);
    return getB20Status(getAddress(address));
  });
}
