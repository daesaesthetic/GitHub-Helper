import type { Pool } from "pg";
import type {
  ContextProvenance,
  ContextRecord,
  ContextScope,
  ContextSourceType
} from "./context.js";

export interface ContextQuery {
  projectId?: string;
  sourceIdentity?: string;
  sourceType?: ContextSourceType;
  scope?: ContextScope;
}

export interface ContextStore {
  upsert(record: ContextRecord): Promise<ContextRecord>;
  findById(id: string): Promise<ContextRecord | undefined>;
  list(query: ContextQuery): Promise<ContextRecord[]>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryContextStore implements ContextStore {
  private readonly records = new Map<string, ContextRecord>();

  async upsert(record: ContextRecord): Promise<ContextRecord> {
    const existing = this.records.get(record.id);
    const saved = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt
    };
    this.records.set(saved.id, saved);
    return saved;
  }

  async findById(id: string): Promise<ContextRecord | undefined> {
    return this.records.get(id);
  }

  async list(query: ContextQuery): Promise<ContextRecord[]> {
    return [...this.records.values()]
      .filter((record) => !query.projectId || record.projectId === query.projectId)
      .filter((record) => !query.sourceIdentity || record.sourceIdentity === query.sourceIdentity)
      .filter((record) => !query.sourceType || record.sourceType === query.sourceType)
      .filter((record) => !query.scope || record.scope === query.scope)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

interface ContextRow {
  id: string;
  project_id: string;
  scope: ContextScope;
  source_type: ContextSourceType;
  source_identity: string;
  content: string;
  metadata: Record<string, string>;
  provenance: ContextProvenance;
  created_at: Date;
  updated_at: Date;
  source_timestamp: Date | null;
}

export class PostgresContextStore implements ContextStore {
  constructor(private readonly pool: Pool) {}

  async upsert(record: ContextRecord): Promise<ContextRecord> {
    const result = await this.pool.query<ContextRow>(
      `INSERT INTO context_records (
        id, project_id, scope, source_type, source_identity, content, metadata, provenance,
        created_at, updated_at, source_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz, $10::timestamptz, $11::timestamptz)
       ON CONFLICT (project_id, source_type, source_identity) DO UPDATE SET
         scope = EXCLUDED.scope,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        provenance = EXCLUDED.provenance,
        updated_at = EXCLUDED.updated_at,
        source_timestamp = EXCLUDED.source_timestamp
      RETURNING *`,
      [
        record.id,
        record.projectId,
        record.scope,
        record.sourceType,
        record.sourceIdentity,
        record.content,
        JSON.stringify(record.metadata),
        JSON.stringify(record.provenance),
        record.createdAt,
        record.updatedAt,
        record.sourceTimestamp ?? null
      ]
    );
    return toContextRecord(result.rows[0]!);
  }

  async findById(id: string): Promise<ContextRecord | undefined> {
    const result = await this.pool.query<ContextRow>("SELECT * FROM context_records WHERE id = $1", [id]);
    return result.rows[0] ? toContextRecord(result.rows[0]) : undefined;
  }

  async list(query: ContextQuery): Promise<ContextRecord[]> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (query.projectId) {
      params.push(query.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (query.sourceIdentity) {
      params.push(query.sourceIdentity);
      clauses.push(`source_identity = $${params.length}`);
    }
    if (query.sourceType) {
      params.push(query.sourceType);
      clauses.push(`source_type = $${params.length}`);
    }
    if (query.scope) {
      params.push(query.scope);
      clauses.push(`scope = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.pool.query<ContextRow>(
      `SELECT * FROM context_records ${where} ORDER BY updated_at DESC`,
      params
    );
    return result.rows.map(toContextRecord);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM context_records WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

function toContextRecord(row: ContextRow): ContextRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    scope: row.scope,
    sourceType: row.source_type,
    sourceIdentity: row.source_identity,
    content: row.content,
    metadata: row.metadata,
    provenance: row.provenance,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    sourceTimestamp: row.source_timestamp?.toISOString()
  };
}