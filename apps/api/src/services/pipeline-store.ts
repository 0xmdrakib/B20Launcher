import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { config } from "../config.js";

export type PipelineJob = { id: string; kind: "launch" | "token" | "publication"; data: Record<string, unknown>; attempts: number; lease: string };
export type TokenSnapshot = { address: string; document: Record<string, unknown>; revision: number; updatedAt: string };
type Change = { revision: number; address: string; updatedAt: string; token: Record<string, unknown> };
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

/** Leases and retry times live in Postgres, never in a serverless process. */
export class PipelineStore {
  private readonly sql;
  private initialization: Promise<void> | undefined;
  private jobs = new Map<string, PipelineJob & { due: number; until: number }>();
  private snapshots = new Map<string, TokenSnapshot>();
  private changes: Change[] = [];
  private state = new Map<string, string>();
  constructor(url?: string) {
    this.sql = url ? postgres(url, { max: 2, prepare: false, ssl: "require", idle_timeout: 20, connect_timeout: 10, onnotice: () => {} }) : undefined;
  }
  async initialize() {
    if (!this.sql) return;
    this.initialization ??= this.sql.begin(async sql => {
      await sql`SELECT pg_advisory_xact_lock(8453, 2002)`;
      await sql`CREATE TABLE IF NOT EXISTS b20_pipeline_jobs (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, data JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lease TEXT, lease_until TIMESTAMPTZ, last_error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE INDEX IF NOT EXISTS b20_pipeline_due_idx ON b20_pipeline_jobs (due_at)`;
      await sql`CREATE TABLE IF NOT EXISTS b20_token_snapshots (
        address TEXT PRIMARY KEY, document JSONB NOT NULL, fingerprint TEXT NOT NULL,
        revision BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS b20_token_changes (
        revision BIGSERIAL PRIMARY KEY, address TEXT NOT NULL,
        document JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS b20_pipeline_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    }).then(() => undefined).catch(error => { this.initialization = undefined; throw error; });
    await this.initialization;
  }
  async enqueue(id: string, kind: PipelineJob["kind"], data: Record<string, unknown>) {
    await this.initialize();
    if (!this.sql) {
      if (!this.jobs.has(id)) this.jobs.set(id, { id, kind, data, attempts: 0, lease: "", due: 0, until: 0 });
      return;
    }
    await this.sql`INSERT INTO b20_pipeline_jobs (id, kind, data) VALUES (${id}, ${kind}, ${this.sql.json(data as never)}) ON CONFLICT (id) DO NOTHING`;
  }
  async claim(id?: string): Promise<PipelineJob | undefined> {
    await this.initialize();
    const lease = randomUUID();
    if (!this.sql) {
      const job = [...this.jobs.values()].filter(j => (!id || j.id === id) && (id || j.due <= Date.now()) && j.until <= Date.now()).sort((a,b) => a.due-b.due)[0];
      if (!job) return;
      job.lease = lease; job.until = Date.now() + 300_000;
      return structuredClone(job);
    }
    const [row] = await this.sql`UPDATE b20_pipeline_jobs SET lease = ${lease}, lease_until = NOW() + INTERVAL '5 minutes'
      WHERE id = (SELECT id FROM b20_pipeline_jobs WHERE (${id ?? null}::text IS NULL OR id = ${id ?? null})
        AND (${Boolean(id)} OR due_at <= NOW()) AND (lease_until IS NULL OR lease_until <= NOW())
        ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    return row ? { id: row.id, kind: row.kind, data: row.data, attempts: row.attempts, lease } as PipelineJob : undefined;
  }
  async finish(job: PipelineJob, delayMs: number | null, data = job.data, error?: string) {
    if (!this.sql) {
      const current = this.jobs.get(job.id);
      if (!current || current.lease !== job.lease || current.until <= Date.now()) return;
      if (delayMs === null) { this.jobs.delete(job.id); return; }
      this.jobs.set(job.id, { ...current, data, attempts: error ? current.attempts + 1 : 0, lease: "", until: 0, due: Date.now() + delayMs });
      return;
    }
    if (delayMs === null) {
      await this.sql`DELETE FROM b20_pipeline_jobs WHERE id = ${job.id} AND lease = ${job.lease} AND lease_until > NOW()`;
      return;
    }
    await this.sql`UPDATE b20_pipeline_jobs SET data = ${this.sql.json(data as never)}, due_at = ${new Date(Date.now()+delayMs)},
      attempts = CASE WHEN ${Boolean(error)} THEN attempts + 1 ELSE 0 END, last_error = ${error?.slice(0, 300) ?? null},
      lease = NULL, lease_until = NULL, updated_at = NOW()
      WHERE id = ${job.id} AND lease = ${job.lease} AND lease_until > NOW()`;
  }
  async getSnapshot(address: string): Promise<TokenSnapshot | undefined> {
    await this.initialize();
    address = address.toLowerCase();
    if (!this.sql) return this.snapshots.get(address);
    const [row] = await this.sql`SELECT * FROM b20_token_snapshots WHERE address = ${address}`;
    return row ? { address, document: row.document, revision: Number(row.revision), updatedAt: new Date(row.updated_at).toISOString() } : undefined;
  }
  async getSnapshots(addresses: string[]) {
    await this.initialize();
    const keys = addresses.map(address => address.toLowerCase());
    if (!keys.length) return new Map<string, TokenSnapshot>();
    if (!this.sql) return new Map(keys.flatMap(key => this.snapshots.has(key) ? [[key, this.snapshots.get(key)!] as const] : []));
    const rows = await this.sql`SELECT * FROM b20_token_snapshots WHERE address IN ${this.sql(keys)}`;
    return new Map(rows.map(row => [row.address as string, { address: row.address, document: row.document, revision: Number(row.revision), updatedAt: new Date(row.updated_at).toISOString() } as TokenSnapshot]));
  }
  async saveSnapshot(address: string, document: Record<string, unknown>, job: PipelineJob) {
    address = address.toLowerCase();
    const fingerprint = createHash("sha256").update(canonicalJson(document)).digest("hex");
    if (!this.sql) {
      const current = this.jobs.get(job.id);
      if (!current || current.lease !== job.lease || current.until <= Date.now()) throw new Error("Worker lease expired");
      if (this.snapshots.has(address) && canonicalJson(this.snapshots.get(address)!.document) === canonicalJson(document)) return;
      const revision = this.changes.length + 1, updatedAt = new Date().toISOString();
      this.snapshots.set(address, { address, document, revision, updatedAt });
      this.changes.push({ revision, address, token: document, updatedAt });
      return;
    }
    await this.sql.begin(async sql => {
      // Serialize commits as well as sequence allocation: a consumer cursor must
      // never pass a lower revision that is still in an uncommitted transaction.
      await sql`SELECT pg_advisory_xact_lock(8453, 2003)`;
      const [active] = await sql`SELECT id FROM b20_pipeline_jobs WHERE id = ${job.id} AND lease = ${job.lease} AND lease_until > NOW() FOR UPDATE`;
      if (!active) throw new Error("Worker lease expired");
      const [previous] = await sql`SELECT fingerprint FROM b20_token_snapshots WHERE address = ${address}`;
      if (previous?.fingerprint === fingerprint) return;
      const [change] = await sql`INSERT INTO b20_token_changes (address, document) VALUES (${address}, ${sql.json(document as never)}) RETURNING revision, updated_at`;
      await sql`INSERT INTO b20_token_snapshots (address, document, fingerprint, revision, updated_at)
        VALUES (${address}, ${sql.json(document as never)}, ${fingerprint}, ${change!.revision}, ${change!.updated_at})
        ON CONFLICT (address) DO UPDATE SET document = EXCLUDED.document, fingerprint = EXCLUDED.fingerprint,
        revision = EXCLUDED.revision, updated_at = EXCLUDED.updated_at`;
    });
  }
  async listChanges(after: number, limit: number): Promise<Change[]> {
    await this.initialize();
    if (!this.sql) return this.changes.filter(c => c.revision > after).slice(0, limit);
    const rows = await this.sql`SELECT * FROM b20_token_changes WHERE revision > ${after} ORDER BY revision LIMIT ${limit}`;
    return rows.map(row => ({ revision: Number(row.revision), address: row.address, token: row.document, updatedAt: new Date(row.updated_at).toISOString() }));
  }
  async readState(key: string) {
    await this.initialize();
    if (!this.sql) return this.state.get(key);
    const [row] = await this.sql`SELECT value FROM b20_pipeline_state WHERE key = ${key}`;
    return row?.value as string | undefined;
  }
  async writeState(key: string, value: string) {
    if (!this.sql) { this.state.set(key, value); return; }
    await this.sql`INSERT INTO b20_pipeline_state (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  async health() {
    await this.initialize();
    if (!this.sql) return { pending: this.jobs.size, retrying: [...this.jobs.values()].filter(j => j.attempts > 0).length, stalled: [...this.jobs.values()].filter(j => j.attempts >= 5).length };
    const [row] = await this.sql`SELECT COUNT(*)::int AS pending, COUNT(*) FILTER (WHERE attempts > 0)::int AS retrying,
      COUNT(*) FILTER (WHERE attempts >= 5)::int AS stalled,
      MIN(due_at) FILTER (WHERE due_at < NOW()) AS oldest_due FROM b20_pipeline_jobs`;
    return row;
  }
  async tokenListVersion(tokens: Array<{ address: string; decimals: number; [key: string]: unknown }>) {
    await this.initialize();
    const evolve = (value?: string) => {
      const previous = value ? JSON.parse(value) as { tokens: typeof tokens; version: { major: number; minor: number; patch: number } } : undefined;
      let version = previous?.version ?? { major: 1, minor: tokens.length, patch: 0 };
      if (previous && JSON.stringify(previous.tokens) !== JSON.stringify(tokens)) {
        const removedOrDecimals = previous.tokens.some(old => !tokens.some(t => t.address === old.address && t.decimals === old.decimals));
        const added = tokens.some(t => !previous.tokens.some(old => old.address === t.address));
        version = removedOrDecimals ? { major: version.major + 1, minor: 0, patch: 0 }
          : added ? { ...version, minor: version.minor + 1, patch: 0 } : { ...version, patch: version.patch + 1 };
      }
      return { version, tokens };
    };
    if (!this.sql) {
      const result = evolve(this.state.get("tokenlist-version"));
      this.state.set("tokenlist-version", JSON.stringify(result)); return result.version;
    }
    return this.sql.begin(async sql => {
      await sql`SELECT pg_advisory_xact_lock(8453, 2004)`;
      const [row] = await sql`SELECT value FROM b20_pipeline_state WHERE key = 'tokenlist-version'`;
      const result = evolve(row?.value);
      if (row?.value === JSON.stringify(result)) return result.version;
      await sql`INSERT INTO b20_pipeline_state (key, value) VALUES ('tokenlist-version', ${JSON.stringify(result)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
      return result.version;
    });
  }
  async close() { await this.sql?.end(); }
}

export const pipelineStore = new PipelineStore(config.NODE_ENV !== "test" ? config.DATABASE_URL || undefined : undefined);
