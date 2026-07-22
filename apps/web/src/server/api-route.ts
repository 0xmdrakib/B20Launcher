import { createHash } from "node:crypto";

import { ApiError, ensureStoreReady, store } from "@base-b20/api/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

type RateLimitConfig = {
  scope: string;
  limit: number;
  windowMs: number;
};

type RouteOptions = {
  rateLimit?: RateLimitConfig;
  noStore?: boolean;
};

function requestIdentity(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(address).digest("hex");
}

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Request validation failed.",
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
      },
      { status: 400 }
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
      { status: error.status }
    );
  }

  console.error("B20 API route failed", error);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

export function metadataAuth(request: NextRequest) {
  return {
    stageId: request.headers.get("x-metadata-stage-id") ?? undefined,
    stageToken: request.headers.get("x-metadata-stage-token") ?? undefined
  };
}

export async function apiRoute(
  request: NextRequest,
  handler: () => Promise<unknown>,
  options: RouteOptions = {}
) {
  try {
    await ensureStoreReady();

    let rateHeaders: Record<string, string> = {};
    if (options.rateLimit) {
      const { scope, limit, windowMs } = options.rateLimit;
      const result = await store.consumeRateLimit(
        `${scope}:${requestIdentity(request)}`,
        limit,
        windowMs
      );
      rateHeaders = {
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": String(result.remaining),
        "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000))
      };
      if (!result.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Try again later." },
          { status: 429, headers: rateHeaders }
        );
      }
    }

    const result = await handler();
    const response = NextResponse.json(result);
    for (const [key, value] of Object.entries(rateHeaders)) response.headers.set(key, value);
    if (options.noStore !== false) response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
