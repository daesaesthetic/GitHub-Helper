import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import {
  createProjectMilestone,
  type MilestoneStatus,
  type ProjectMilestone,
  type ProjectMilestoneInput
} from "./milestone.js";
import type { MilestoneQuery, MilestoneStore } from "./milestone-store.js";

export class MilestoneNotFoundError extends Error {}
export class CurrentMilestoneConflictError extends Error {}

export class MilestoneService {
  constructor(
    private readonly store: MilestoneStore,
    private readonly projects: ProjectService
  ) {}

  async create(
    input: Omit<ProjectMilestoneInput, "id"> & { id?: string },
    identity: RequestIdentity
  ): Promise<ProjectMilestone> {
    const project = this.projects.getAccessibleProject(input.projectId, identity);
    input = { ...input, projectId: project.id };
    if (input.status === "current") {
      await this.assertNoCurrentConflict(input.projectId);
    }
    const milestone = createProjectMilestone({
      ...input,
      id: input.id ?? `milestone:${input.projectId}:${crypto.randomUUID()}`
    });
    return this.upsertSafely(milestone);
  }

  async getProjectMilestones(
    projectId: string,
    identity: RequestIdentity
  ): Promise<ProjectMilestone[]> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    return this.store.list({ projectId: project.id });
  }

  async update(
    id: string,
    changes: Partial<Pick<ProjectMilestone, "title" | "description" | "position">>,
    identity: RequestIdentity
  ): Promise<ProjectMilestone> {
    const existing = await this.getById(id, identity);
    return this.upsertSafely(createProjectMilestone({
      id: existing.id,
      projectId: existing.projectId,
      title: changes.title ?? existing.title,
      description: changes.description ?? existing.description,
      status: existing.status,
      position: changes.position ?? existing.position
    }, {
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    }));
  }

  async changeStatus(
    id: string,
    status: MilestoneStatus,
    identity: RequestIdentity
  ): Promise<ProjectMilestone> {
    const existing = await this.getById(id, identity);
    if (status === "current") {
      await this.assertNoCurrentConflict(existing.projectId, existing.id);
    }
    const now = new Date().toISOString();
    return this.upsertSafely(createProjectMilestone({
      ...existing,
      status,
      position: existing.position,
      completedAt: status === "completed" ? now : undefined
    }, {
      createdAt: existing.createdAt,
      updatedAt: now
    }));
  }

  async remove(id: string, identity: RequestIdentity): Promise<boolean> {
    await this.getById(id, identity);
    return this.store.delete(id);
  }

  private async getById(id: string, identity: RequestIdentity): Promise<ProjectMilestone> {
    const milestone = await this.store.findById(id);
    if (!milestone) throw new MilestoneNotFoundError("Milestone was not found");
    this.projects.getAccessibleProject(milestone.projectId, identity);
    return milestone;
  }

  private async assertNoCurrentConflict(projectId: string, exceptId?: string): Promise<void> {
    const current = await this.store.list({ projectId, status: "current" });
    if (current.some((milestone) => milestone.id !== exceptId)) {
      throw new CurrentMilestoneConflictError("A project can have only one current milestone");
    }
  }

  private async upsertSafely(milestone: ProjectMilestone): Promise<ProjectMilestone> {
    try {
      return await this.store.upsert(milestone);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        error.constraint === "project_milestones_one_current_idx"
      ) {
        throw new CurrentMilestoneConflictError("A project can have only one current milestone");
      }
      throw error;
    }
  }
}