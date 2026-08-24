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

export class MilestoneService {
  constructor(
    private readonly store: MilestoneStore,
    private readonly projects: ProjectService
  ) {}

  async create(
    input: Omit<ProjectMilestoneInput, "id"> & { id?: string },
    identity: RequestIdentity
  ): Promise<ProjectMilestone> {
    this.projects.getAccessibleProject(input.projectId, identity);
    const milestone = createProjectMilestone({
      ...input,
      id: input.id ?? `milestone:${input.projectId}:${crypto.randomUUID()}`
    });
    return this.store.upsert(milestone);
  }

  async getProjectMilestones(
    projectId: string,
    identity: RequestIdentity
  ): Promise<ProjectMilestone[]> {
    this.projects.getAccessibleProject(projectId, identity);
    return this.store.list({ projectId });
  }

  async update(
    id: string,
    changes: Partial<Pick<ProjectMilestone, "title" | "description" | "position">>,
    identity: RequestIdentity
  ): Promise<ProjectMilestone> {
    const existing = await this.getById(id, identity);
    return this.store.upsert(createProjectMilestone({
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
    const now = new Date().toISOString();
    return this.store.upsert(createProjectMilestone({
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
}