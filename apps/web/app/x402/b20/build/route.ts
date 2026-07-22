import { buildLaunchPackage, config } from "@base-b20/api/core";
import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";

import { apiRoute, metadataAuth } from "../../../../src/server/api-route";
import { b20X402Route, createB20X402Server } from "../../../../src/server/x402";

export const runtime = "nodejs";

const handler = (request: NextRequest) => apiRoute(request, async () => {
  const { tx } = await buildLaunchPackage(await request.json(), metadataAuth(request));
  return tx;
});

export const POST = config.X402_ENABLED
  ? withX402(handler, b20X402Route, createB20X402Server())
  : async (request: NextRequest) => {
      const response = await handler(request);
      response.headers.set("X-B20-X402-Mode", "disabled-local-development");
      return response;
    };
