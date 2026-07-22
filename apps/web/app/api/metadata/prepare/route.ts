import { ApiError, MAX_LOGO_BYTES, prepareMetadata, type UploadedLogo } from "@base-b20/api/core";
import { NextRequest } from "next/server";

import { apiRoute } from "../../../../src/server/api-route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return apiRoute(request, async () => {
    const form = await request.formData();
    const logo = form.get("logo");
    if (!(logo instanceof File)) throw new ApiError("A token logo is required.", 400);
    if (logo.size > MAX_LOGO_BYTES) throw new ApiError("Logo must be 1 MB or smaller.", 400);

    const uploaded: UploadedLogo = {
      originalname: logo.name,
      mimetype: logo.type,
      size: logo.size,
      buffer: Buffer.from(await logo.arrayBuffer())
    };
    return prepareMetadata({
      name: String(form.get("name") ?? ""),
      symbol: String(form.get("symbol") ?? ""),
      description: String(form.get("description") ?? ""),
      externalLink: String(form.get("externalLink") ?? ""),
      variant: String(form.get("variant") ?? "asset") as "asset" | "stablecoin"
    }, uploaded);
  }, { rateLimit: { scope: "metadata-prepare", limit: 12, windowMs: 60 * 60 * 1000 } });
}
