import type { LaunchDraftInput, UnsignedLaunchTransaction } from "@base-b20/b20";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4020";

export type PreparedMetadataResponse = {
  stageId: string;
  stageToken?: string;
  expiresAt: string;
  logo?: {
    cid: string;
    uri: string;
    gatewayUrls: string[];
    provider: "staged" | "lighthouse";
    sha256: string;
    size: number;
  };
  metadata: unknown;
  contract: {
    cid: string;
    uri: string;
    gatewayUrls: string[];
    provider: "staged" | "lighthouse";
    sha256: string;
    size: number;
  };
  gatewayHealth: Array<{ url: string; ok: boolean; status?: number; ms: number }>;
  storage: {
    provider: "Lighthouse";
    network: "IPFS + Filecoin";
    status: "staged" | "committed";
    verified: boolean;
    uploadedAt?: string;
  };
};

export type QuoteResponse = {
  predictedToken: string;
  salt: string;
  gasEstimate: string | null;
  warnings: string[];
  transaction: UnsignedLaunchTransaction;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers
    }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof json?.error === "string" ? json.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return json as T;
}

export async function prepareMetadata(form: FormData) {
  return jsonFetch<PreparedMetadataResponse>("/api/metadata/prepare", {
    method: "POST",
    body: form
  });
}

export async function commitMetadata(body: {
  stageId: string;
  stageToken: string;
  idempotencyKey: string;
  txHash: string;
}) {
  return jsonFetch<PreparedMetadataResponse>("/api/metadata/commit", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function quoteLaunch(body: LaunchDraftInput, stageId: string, stageToken: string) {
  return jsonFetch<QuoteResponse>("/api/b20/quote", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "X-Metadata-Stage-Id": stageId,
      "X-Metadata-Stage-Token": stageToken
    }
  });
}

export async function buildLaunch(body: LaunchDraftInput, stageId: string, stageToken: string) {
  return jsonFetch<UnsignedLaunchTransaction>("/api/b20/build", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "X-Metadata-Stage-Id": stageId,
      "X-Metadata-Stage-Token": stageToken
    }
  });
}

export async function getStatus(address: string) {
  return jsonFetch(`/api/b20/${address}/status`);
}

export { API_URL };
