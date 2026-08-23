import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import type { ProjectMilestone } from "./milestone.js";

export interface MilestoneStore {
  listByProject(projectId: string): Promise<ProjectMilestone[]>;
}

export class InMemoryMilestoneStore implements MilestoneStore {
  constructor(private readonly milestones: ProjectMilestone[] = []) {}

  async listByProject(projectId: string): Promise<ProjectMilestone[]> {
    return this.milestones.filter((milestone) => milestone.projectId === projectId);
  }
}

export class MilestoneService {
  constructor(
    private readonly store: MilestoneStore,
    private readonly projects: ProjectService
  ) {}

  async getProjectMilestones(
    projectId: string,
    identity: RequestIdentity
  ): Promise<ProjectMilestone[]> {
    this.projects.getAccessibleProject(projectId, identity);
    return this.store.listByProject(projectId);
  }
}