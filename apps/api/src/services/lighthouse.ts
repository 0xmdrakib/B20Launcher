import { z } from "zod";

import { ApiError } from "../lib/errors.js";

const LIGHTHOUSE_UPLOAD_URL =
  "https://upload.lighthouse.storage/api/v0/add?cid-version=1&raw-leaves=false&wrap-with-directory=false";
const LIGHTHOUSE_USAGE_URL = "https://api.lighthouse.storage/api/user/user_data_usage";
const LIGHTHOUSE_UPLOADS_URL =
  "https://api.lighthouse.storage/api/user/files_uploaded?fileType=annual";
const FREE_TRIAL_BYTES = 5 * 1024 * 1024 * 1024;
const FREE_TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

const uploadResponseSchema = z.object({
  Hash: z.string().min(1),
  Size: z.union([z.string(), z.number()]).optional()
});

export type LighthouseUploadResult = z.infer<typeof uploadResponseSchema>;

const usageResponseSchema = z.object({
  dataLimit: z.number(),
  dataLimitPermanent: z.number().default(0)
});

const uploadsResponseSchema = z.object({
  fileList: z.array(z.object({ createdAt: z.number() })).default([])
});

export async function assertLighthouseUploadAvailable(apiKey: string): Promise<void> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  let usageResponse: Response;
  try {
    usageResponse = await fetch(LIGHTHOUSE_USAGE_URL, {
      headers,
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new ApiError(
      "Token launches are temporarily unavailable because storage could not be verified. No transaction was created.",
      503
    );
  }
  if (usageResponse.status === 401) {
    throw new ApiError(
      "Token launches are temporarily unavailable because the storage credential is invalid. No transaction was created.",
      503
    );
  }
  if (!usageResponse.ok) {
    throw new ApiError(
      "Token launches are temporarily unavailable because storage could not be verified. No transaction was created.",
      503
    );
  }

  const usage = usageResponseSchema.safeParse(await usageResponse.json().catch(() => undefined));
  if (!usage.success) {
    throw new ApiError(
      "Token launches are temporarily unavailable because storage could not be verified. No transaction was created.",
      503
    );
  }
  if (
    usage.data.dataLimit > FREE_TRIAL_BYTES ||
    usage.data.dataLimitPermanent > 0
  ) {
    return;
  }

  let uploadsResponse: Response;
  try {
    uploadsResponse = await fetch(LIGHTHOUSE_UPLOADS_URL, {
      headers,
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new ApiError(
      "Token launches are temporarily unavailable because storage could not be verified. No transaction was created.",
      503
    );
  }
  if (!uploadsResponse.ok) {
    throw new ApiError(
      "Token launches are temporarily unavailable because storage could not be verified. No transaction was created.",
      503
    );
  }

  const uploads = uploadsResponseSchema.safeParse(
    await uploadsResponse.json().catch(() => undefined)
  );
  if (!uploads.success) {
    throw new ApiError(
      "Token launches are temporarily unavailable because storage could not be verified. No transaction was created.",
      503
    );
  }

  const firstUploadAt = uploads.data.fileList.reduce(
    (oldest, file) => Math.min(oldest, file.createdAt),
    Number.POSITIVE_INFINITY
  );
  if (Number.isFinite(firstUploadAt) && Date.now() - firstUploadAt >= FREE_TRIAL_MS) {
    throw new ApiError(
      "Token launches are temporarily unavailable because the Lighthouse storage plan has expired. No transaction was created.",
      503
    );
  }
}

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
