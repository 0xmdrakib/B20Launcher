import postgres, { type Sql } from "postgres";
import type { Address, Hex } from "viem";

import { config } from "../config.js";

const PUBLISHING_RETRY_TTL_MS = 24 * 60 * 60 * 1000;

export type LaunchRecord = {
  idempotencyKey: string;
  predictedToken: string;
  payload: unknown;
  createdAt: string;
};

export type MetadataStageRecord<TPrepared = unknown> = {
  stageId: string;
  secretHash: string;
  contractUri: string;
  expiresAt: string;
  logoBody?: Buffer;
  contractBody?: string;
  prepared: TPrepared;
  status: "staged" | "bound" | "publishing" | "committed";
  binding?: {
    idempotencyKey: string;
    to: Address;
    attributedData: Hex;
  };
  txHash?: Hex;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export interface Store {
  readonly kind: "memory" | "postgres";
  initialize(): Promise<void>;
  saveLaunch(record: LaunchRecord): Promise<void>;
  getLaunch(idempotencyKey: string): Promise<LaunchRecord | undefined>;
  saveMetadataStage(record: MetadataStageRecord): Promise<void>;
  getMetadataStage(stageId: string): Promise<MetadataStageRecord | undefined>;
  getMetadataStageByContractUri(contractUri: string): Promise<MetadataStageRecord | undefined>;
  bindMetadataStage(
    stageId: string,
    binding: NonNullable<MetadataStageRecord["binding"]>
  ): Promise<void>;
  markMetadataPublishing(stageId: string, txHash: Hex): Promise<void>;
  completeMetadataStage(stageId: string, prepared: unknown, txHash: Hex): Promise<void>;
  deleteMetadataStage(stageId: string): Promise<void>;
  cleanupMetadataStages(): Promise<number>;
  consumeRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private readonly launches = new Map<string, LaunchRecord>();
  private readonly metadataStages = new Map<string, MetadataStageRecord>();
  private readonly rateLimits = new Map<string, { windowStart: number; hits: number }>();

  async initialize() {}

  async saveLaunch(record: LaunchRecord) {
    this.launches.set(record.idempotencyKey, record);
  }

  async getLaunch(idempotencyKey: string) {
    return this.launches.get(idempotencyKey);
  }

  async saveMetadataStage(record: MetadataStageRecord) {
    this.metadataStages.set(record.stageId, record);
  }

  async getMetadataStage(stageId: string) {
    return this.metadataStages.get(stageId);
  }

  async getMetadataStageByContractUri(contractUri: string) {
    return [...this.metadataStages.values()].find((stage) => stage.contractUri === contractUri);
  }

  async bindMetadataStage(stageId: string, binding: NonNullable<MetadataStageRecord["binding"]>) {
    const stage = this.metadataStages.get(stageId);
    if (!stage) return;
    this.metadataStages.set(stageId, { ...stage, binding, status: "bound" });
  }

  async markMetadataPublishing(stageId: string, txHash: Hex) {
    const stage = this.metadataStages.get(stageId);
    if (!stage) return;
    const retryUntil = new Date(Date.now() + PUBLISHING_RETRY_TTL_MS).toISOString();
    this.metadataStages.set(stageId, {
      ...stage,
      expiresAt: Date.parse(stage.expiresAt) > Date.parse(retryUntil) ? stage.expiresAt : retryUntil,
      txHash,
      status: "publishing"
    });
  }

  async completeMetadataStage(stageId: string, prepared: unknown, txHash: Hex) {
    const stage = this.metadataStages.get(stageId);
    if (!stage) return;
    const { logoBody: _logoBody, contractBody: _contractBody, ...retained } = stage;
    this.metadataStages.set(stageId, {
      ...retained,
      prepared,
      txHash,
      status: "committed"
    });
  }

  async deleteMetadataStage(stageId: string) {
    this.metadataStages.delete(stageId);
  }

  async cleanupMetadataStages() {
    const now = Date.now();
    let removed = 0;
    for (const [stageId, stage] of this.metadataStages) {
      if (stage.status !== "committed" && Date.parse(stage.expiresAt) <= now) {
        this.metadataStages.delete(stageId);
        removed += 1;
      }
    }
    return removed;
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    for (const [storedKey, entry] of this.rateLimits) {
      if (entry.windowStart + windowMs <= now) this.rateLimits.delete(storedKey);
    }
    const current = this.rateLimits.get(key);
    const hits = current?.windowStart === windowStart ? current.hits + 1 : 1;
    this.rateLimits.set(key, { windowStart, hits });
    return {
      allowed: hits <= limit,
      remaining: Math.max(0, limit - hits),
      resetAt: windowStart + windowMs
    };
  }
}

class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private readonly sql: Sql;

  constructor(url: string) {
    this.sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require"
    });
  }

  async initialize() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS b20_launch_records (
        idempotency_key TEXT PRIMARY KEY,
        predicted_token TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `;
    await this.sql`
      CREATE TABLE IF NOT EXISTS b20_metadata_stages (
        stage_id UUID PRIMARY KEY,
        secret_hash TEXT NOT NULL,
        contract_uri TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        logo_body BYTEA,
        contract_body TEXT,
        prepared JSONB NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('staged', 'bound', 'publishing', 'committed')),
        idempotency_key TEXT,
        tx_to TEXT,
        attributed_data TEXT,
        tx_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await this.sql`
      ALTER TABLE b20_metadata_stages
      DROP CONSTRAINT IF EXISTS b20_metadata_stages_contract_uri_key
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS b20_metadata_stages_expiry_idx
      ON b20_metadata_stages (expires_at)
      WHERE status <> 'committed'
    `;
    await this.sql`
      CREATE TABLE IF NOT EXISTS b20_rate_limits (
        scope_key TEXT NOT NULL,
        window_start BIGINT NOT NULL,
        hits INTEGER NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (scope_key, window_start)
      )
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS b20_rate_limits_expiry_idx
      ON b20_rate_limits (expires_at)
    `;
  }

  async saveLaunch(record: LaunchRecord) {
    await this.sql`
      INSERT INTO b20_launch_records (idempotency_key, predicted_token, payload, created_at)
      VALUES (${record.idempotencyKey}, ${record.predictedToken}, ${this.sql.json(record.payload as never)}, ${record.createdAt})
      ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
    `;
  }

  async getLaunch(idempotencyKey: string) {
    const [row] = await this.sql`
      SELECT idempotency_key, predicted_token, payload, created_at
      FROM b20_launch_records WHERE idempotency_key = ${idempotencyKey}
    `;
    if (!row) return undefined;
    return {
      idempotencyKey: row.idempotency_key as string,
      predictedToken: row.predicted_token as string,
      payload: row.payload,
      createdAt: new Date(row.created_at as string).toISOString()
    };
  }

  async saveMetadataStage(record: MetadataStageRecord) {
    await this.sql`
      INSERT INTO b20_metadata_stages
        (stage_id, secret_hash, contract_uri, expires_at, logo_body, contract_body, prepared, status)
      VALUES
        (${record.stageId}, ${record.secretHash}, ${record.contractUri}, ${record.expiresAt},
         ${record.logoBody ?? null}, ${record.contractBody ?? null}, ${this.sql.json(record.prepared as never)}, ${record.status})
    `;
  }

  private fromMetadataRow(row: Record<string, unknown>): MetadataStageRecord {
    const binding = row.idempotency_key && row.tx_to && row.attributed_data
      ? {
          idempotencyKey: row.idempotency_key as string,
          to: row.tx_to as Address,
          attributedData: row.attributed_data as Hex
        }
      : undefined;
    return {
      stageId: row.stage_id as string,
      secretHash: row.secret_hash as string,
      contractUri: row.contract_uri as string,
      expiresAt: new Date(row.expires_at as string).toISOString(),
      prepared: row.prepared,
      status: row.status as MetadataStageRecord["status"],
      ...(row.logo_body ? { logoBody: Buffer.from(row.logo_body as Uint8Array) } : {}),
      ...(row.contract_body ? { contractBody: row.contract_body as string } : {}),
      ...(binding ? { binding } : {}),
      ...(row.tx_hash ? { txHash: row.tx_hash as Hex } : {})
    };
  }

  async getMetadataStage(stageId: string) {
    const [row] = await this.sql`SELECT * FROM b20_metadata_stages WHERE stage_id = ${stageId}`;
    return row ? this.fromMetadataRow(row) : undefined;
  }

  async getMetadataStageByContractUri(contractUri: string) {
    const [row] = await this.sql`SELECT * FROM b20_metadata_stages WHERE contract_uri = ${contractUri}`;
    return row ? this.fromMetadataRow(row) : undefined;
  }

  async bindMetadataStage(stageId: string, binding: NonNullable<MetadataStageRecord["binding"]>) {
    await this.sql`
      UPDATE b20_metadata_stages
      SET idempotency_key = ${binding.idempotencyKey}, tx_to = ${binding.to},
          attributed_data = ${binding.attributedData}, status = 'bound', updated_at = NOW()
      WHERE stage_id = ${stageId} AND status IN ('staged', 'bound')
    `;
  }

  async markMetadataPublishing(stageId: string, txHash: Hex) {
    await this.sql`
      UPDATE b20_metadata_stages
      SET status = 'publishing', tx_hash = ${txHash},
          expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours'), updated_at = NOW()
      WHERE stage_id = ${stageId} AND status IN ('bound', 'publishing')
    `;
  }

  async completeMetadataStage(stageId: string, prepared: unknown, txHash: Hex) {
    await this.sql`
      UPDATE b20_metadata_stages
      SET status = 'committed', prepared = ${this.sql.json(prepared as never)}, tx_hash = ${txHash},
          logo_body = NULL, contract_body = NULL, secret_hash = 'consumed', updated_at = NOW()
      WHERE stage_id = ${stageId}
    `;
  }

  async deleteMetadataStage(stageId: string) {
    await this.sql`DELETE FROM b20_metadata_stages WHERE stage_id = ${stageId}`;
  }

  async cleanupMetadataStages() {
    const rows = await this.sql`
      DELETE FROM b20_metadata_stages
      WHERE status <> 'committed' AND expires_at <= NOW()
      RETURNING stage_id
    `;
    await this.sql`
      DELETE FROM b20_rate_limits WHERE expires_at <= NOW()
    `;
    return rows.length;
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const expiresAt = new Date(windowStart + windowMs);
    const [row] = await this.sql`
      INSERT INTO b20_rate_limits (scope_key, window_start, hits, expires_at)
      VALUES (${key}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT (scope_key, window_start)
      DO UPDATE SET hits = b20_rate_limits.hits + 1
      RETURNING hits
    `;
    const hits = Number(row?.hits ?? limit + 1);
    return {
      allowed: hits <= limit,
      remaining: Math.max(0, limit - hits),
      resetAt: windowStart + windowMs
    };
  }
}

export const store: Store = config.NODE_ENV !== "test" && config.DATABASE_URL
  ? new PostgresStore(config.DATABASE_URL)
  : new MemoryStore();

let storeInitialization: Promise<void> | undefined;
let lastCleanupAt = 0;

export async function ensureStoreReady() {
  if (config.NODE_ENV === "production" && !config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production for durable, abuse-resistant metadata staging.");
  }

  storeInitialization ??= store.initialize().catch((error) => {
    storeInitialization = undefined;
    throw error;
  });
  await storeInitialization;

  const now = Date.now();
  if (now - lastCleanupAt >= 5 * 60 * 1000) {
    lastCleanupAt = now;
    await store.cleanupMetadataStages();
  }
}
