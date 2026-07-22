import { getAgentManifest } from "@base-b20/api/core";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAgentManifest(), { headers: { "Cache-Control": "no-store" } });
}
