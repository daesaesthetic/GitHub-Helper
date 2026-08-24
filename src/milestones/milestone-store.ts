import type { Pool } from "pg";
import type {
  MilestoneStatus,
  ProjectMilestone
} from "./milestone.js";

export interface MilestoneQuery {
  projectId?: string;
  status?: MilestoneStatus;
}

export interface MilestoneStore {
  upsert(milestone: ProjectMilestone): Promise<ProjectMilestone>;
  findById(id: string): Promise<ProjectMilestone | undefined>;
  list(query: MilestoneQuery): Promise<ProjectMilestone[]>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryMilestoneStore implements MilestoneStore {
  private readonly milestones = new Map<string, ProjectMilestone>();

  constructor(initial: ProjectMilestone[] = []) {
    for (const milestone of initial) this.milestones.set(milestone.id, milestone);
  }

  async upsert(milestone: ProjectMilestone): Promise<ProjectMilestone> {
    const existing = this.milestones.get(milestone.id);
    if (milestone.status === "current") {
      const conflict = [...this.milestones.values()].find(
        (item) => item.projectId === milestone.projectId
          && item.status === "current"
          && item.id !== milestone.id
      );
      if (conflict) throw new Error("A project can have only one current milestone");
    }
    const saved = { ...milestone, createdAt: existing?.createdAt ?? milestone.createdAt };
    this.milestones.set(saved.id, saved);
    return saved;
  }

  async findById(id: string): Promise<ProjectMilestone | undefined> {
    return this.milestones.get(id);
  }

  async list(query: MilestoneQuery): Promise<ProjectMilestone[]> {
    return [...this.milestones.values()]
      .filter((milestone) => !query.projectId || milestone.projectId === query.projectId)
      .filter((milestone) => !query.status || milestone.status === query.status)
      .sort((left, right) =>
        left.position - right.position || left.createdAt.localeCompare(right.createdAt)
      );
  }

  async delete(id: string): Promise<boolean> {
    return this.milestones.delete(id);
  }
}

interface MilestoneRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  position: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export class PostgresMilestoneStore implements MilestoneStore {
  constructor(private readonly pool: Pool) {}

  async upsert(milestone: ProjectMilestone): Promise<ProjectMilestone> {
    const result = await this.pool.query<MilestoneRow>(
      `INSERT INTO project_milestones (
        id, project_id, title, description, status, position, created_at, updated_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        position = EXCLUDED.position,
        updated_at = EXCLUDED.updated_at,
        completed_at = EXCLUDED.completed_at
      RETURNING *`,
      [
        milestone.id,
        milestone.projectId,
        milestone.title,
        milestone.description ?? null,
        milestone.status,
        milestone.position,
        milestone.createdAt,
        milestone.updatedAt,
        milestone.completedAt ?? null
      ]
    );
    return toMilestone(result.rows[0]!);
  }

  async findById(id: string): Promise<ProjectMilestone | undefined> {
    const result = await this.pool.query<MilestoneRow>(
      "SELECT * FROM project_milestones WHERE id = $1",
      [id]
    );
    return result.rows[0] ? toMilestone(result.rows[0]) : undefined;
  }

  async list(query: MilestoneQuery): Promise<ProjectMilestone[]> {
    const clauses: string[] = [];
    const params: string[] = [];
    if (query.projectId) {
      params.push(query.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.pool.query<MilestoneRow>(
      `SELECT * FROM project_milestones ${where} ORDER BY position ASC, created_at ASC`,
      params
    );
    return result.rows.map(toMilestone);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM project_milestones WHERE id = $1",
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function toMilestone(row: MilestoneRow): ProjectMilestone {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    position: row.position,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString()
  };
}