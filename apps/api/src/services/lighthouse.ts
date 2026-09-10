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

const managedFileSchema = z.object({ id: z.string().uuid(), cid: z.string().min(1), fileName: z.string() });
export type LighthouseFile = z.infer<typeof managedFileSchema>;

export function stageUploadNames(stageId: string) {
  z.string().uuid().parse(stageId);
  return { logo: `b20-${stageId}-logo.png`, contract: `b20-${stageId}-profile.json` };
}

// Account inventory only; never retrieve unrelated file contents. A full,
// validated listing is required before absence can be treated as deletion.
export async function listLighthouseAnnualFiles(apiKey: string): Promise<LighthouseFile[]> {
  const files = new Map<string, LighthouseFile>();
  let lastKey = "null";
  for (let page = 0; page < 20; page++) {
    const response = await fetch(`${LIGHTHOUSE_UPLOADS_URL}&lastKey=${encodeURIComponent(lastKey)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000), redirect: "error"
    });
    if (!response.ok) throw new ApiError("Storage inventory could not be verified.", 502);
    const parsed = z.object({ fileList: z.array(managedFileSchema) }).safeParse(await response.json());
    if (!parsed.success) throw new ApiError("Storage inventory was invalid.", 502);
    const batch = parsed.data.fileList;
    if (!batch.length) return [...files.values()];
    for (const file of batch) {
      if (files.has(file.id)) throw new ApiError("Storage inventory pagination did not advance.", 502);
      files.set(file.id, file);
    }
    lastKey = batch.at(-1)!.id;
    // Official API pages contain at most 2,000 files. Request the next page even
    // for short batches, avoiding reliance on inconsistent totalFiles values.
  }
  throw new ApiError("Storage inventory exceeded the maintenance batch limit.", 503);
}

export async function deleteLighthouseFile(fileId: string, apiKey: string): Promise<void> {
  z.string().uuid().parse(fileId);
  const response = await fetch(`https://api.lighthouse.storage/api/user/delete_file?id=${encodeURIComponent(fileId)}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000), redirect: "error"
  });
  if (!response.ok) throw new ApiError("Storage cleanup is pending retry.", 502);
  const payload = z.object({ message: z.string() }).safeParse(await response.json());
  if (!payload.success || !/^File deleted successfully\.?$/i.test(payload.data.message)) {
    throw new ApiError("Storage deletion was not confirmed.", 502);
  }
}

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
      headers: { Authorization: `Bearer ${apiKey}`, "X-Storage-Type": "annual" },
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
