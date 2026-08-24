import type { Pool } from "pg";
import type { Project } from "./project.js";
import type { ProjectRepository } from "./project-service.js";

export class PostgresProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  constructor(private readonly pool: Pool) {}

  async initialize(): Promise<void> {
    await this.pool.query(PROJECTS_SCHEMA);
    const result = await this.pool.query<ProjectRow>("SELECT * FROM projects ORDER BY created_at ASC");
    this.projects.clear();
    for (const row of result.rows) this.projects.set(row.id, toProject(row));
  }

  findById(id: string): Project | undefined {
    return this.projects.get(id);
  }

  list(): Project[] {
    return [...this.projects.values()];
  }

  async save(project: Project): Promise<Project> {
    const result = await this.pool.query<ProjectRow>(
      `INSERT INTO projects (
        id, name, owner_id, description, status, metadata, integration_references, integrations
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        owner_id = EXCLUDED.owner_id,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        integration_references = EXCLUDED.integration_references,
        integrations = EXCLUDED.integrations,
        updated_at = NOW()
      RETURNING *`,
      [
        project.id,
        project.name,
        project.ownerId,
        project.description,
        project.status,
        JSON.stringify(project.metadata),
        JSON.stringify(project.integrationReferences),
        JSON.stringify(project.integrations)
      ]
    );
    const saved = toProject(result.rows[0]!);
    this.projects.set(saved.id, saved);
    return saved;
  }
}

export const PROJECTS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    integration_references JSONB NOT NULL DEFAULT '[]'::jsonb,
    integrations JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_id, name);
`;

interface ProjectRow {
  id: string;
  name: string;
  owner_id: string;
  description: string;
  status: string;
  metadata: Record<string, string>;
  integration_references: string[];
  integrations: Project["integrations"];
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    description: row.description,
    status: row.status,
    metadata: row.metadata,
    integrationReferences: row.integration_references,
    integrations: row.integrations
  };
}