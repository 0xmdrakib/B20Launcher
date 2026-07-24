import { z } from "zod";

import { ApiError } from "../lib/errors.js";

const LIGHTHOUSE_UPLOAD_URL =
  "https://upload.lighthouse.storage/api/v0/add?cid-version=1&raw-leaves=false&wrap-with-directory=false";

const uploadResponseSchema = z.object({
  Hash: z.string().min(1),
  Size: z.union([z.string(), z.number()]).optional()
});

export type LighthouseUploadResult = z.infer<typeof uploadResponseSchema>;

export async function uploadToLighthouse(
  body: Buffer | string,
  filename: string,
  apiKey: string
): Promise<LighthouseUploadResult> {
  const form = new FormData();
  const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  form.set("file", new Blob([Uint8Array.from(bytes)]), filename);

  let response: Response;
  try {
    response = await fetch(LIGHTHOUSE_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000)
    });
  } catch {
    throw new ApiError("Lighthouse upload could not be reached. Please retry.", 502);
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError("Lighthouse rejected the metadata upload. Please retry.", 502);
  }

  const parsed = uploadResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("Lighthouse returned an invalid upload response.", 502);
  }
  return parsed.data;
}
