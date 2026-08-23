import type { Pool } from "pg";
import type {
  RealityFactType,
  RealityRecord,
  RealityVerificationState
} from "./reality.js";

export interface RealityQuery {
  projectId?: string;
  factType?: RealityFactType;
  verificationState?: RealityVerificationState;
}

export interface RealityStore {
  upsert(record: RealityRecord): Promise<RealityRecord>;
  findById(id: string): Promise<RealityRecord | undefined>;
  list(query: RealityQuery): Promise<RealityRecord[]>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryRealityStore implements RealityStore {
  private readonly records = new Map<string, RealityRecord>();

  async upsert(record: RealityRecord): Promise<RealityRecord> {
    const existing = this.records.get(record.id);
    const saved = { ...record, createdAt: existing?.createdAt ?? record.createdAt };
    this.records.set(record.id, saved);
    return saved;
  }

  async findById(id: string): Promise<RealityRecord | undefined> {
    return this.records.get(id);
  }

  async list(query: RealityQuery): Promise<RealityRecord[]> {
    return [...this.records.values()]
      .filter((record) => !query.projectId || record.projectId === query.projectId)
      .filter((record) => !query.factType || record.factType === query.factType)
      .filter((record) => !query.verificationState || record.verificationState === query.verificationState)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

interface RealityRow {
  id: string;
  project_id: string;
  fact_type: RealityFactType;
  value: Record<string, string>;
  verification_state: RealityVerificationState;
  supporting_context_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresRealityStore implements RealityStore {
  constructor(private readonly pool: Pool) {}

  async upsert(record: RealityRecord): Promise<RealityRecord> {
    const result = await this.pool.query<RealityRow>(
      `INSERT INTO reality_records (
        id, project_id, fact_type, value, verification_state, supporting_context_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::timestamptz, $8::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        value = EXCLUDED.value,
        verification_state = EXCLUDED.verification_state,
        supporting_context_id = EXCLUDED.supporting_context_id,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        record.id,
        record.projectId,
        record.factType,
        JSON.stringify(record.value),
        record.verificationState,
        record.supportingContextId ?? null,
        record.createdAt,
        record.updatedAt
      ]
    );
    return toRealityRecord(result.rows[0]!);
  }

  async findById(id: string): Promise<RealityRecord | undefined> {
    const result = await this.pool.query<RealityRow>(
      "SELECT * FROM reality_records WHERE id = $1",
      [id]
    );
    return result.rows[0] ? toRealityRecord(result.rows[0]) : undefined;
  }

  async list(query: RealityQuery): Promise<RealityRecord[]> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (query.projectId) {
      params.push(query.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (query.factType) {
      params.push(query.factType);
      clauses.push(`fact_type = $${params.length}`);
    }
    if (query.verificationState) {
      params.push(query.verificationState);
      clauses.push(`verification_state = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.pool.query<RealityRow>(
      `SELECT * FROM reality_records ${where} ORDER BY updated_at DESC`,
      params
    );
    return result.rows.map(toRealityRecord);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM reality_records WHERE id = $1",
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function toRealityRecord(row: RealityRow): RealityRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    factType: row.fact_type,
    value: row.value,
    verificationState: row.verification_state,
    supportingContextId: row.supporting_context_id ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}