import type { RequestIdentity } from "../identity.js";
import type { Project } from "./project.js";

export class ProjectNotFoundError extends Error {}
export class ProjectAccessDeniedError extends Error {}

export interface ProjectRepository {
  findById(id: string): Project | undefined;
}

export class InMemoryProjectRepository implements ProjectRepository {
  constructor(private readonly project: Project) {}
  findById(id: string): Project | undefined {
    return id === this.project.id ? this.project : undefined;
  }
}

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  getProjectById(id: string): Project {
    const project = this.repository.findById(id);
    if (!project) throw new ProjectNotFoundError("Project was not found");
    return project;
  }

  getAccessibleProject(id: string, identity: RequestIdentity): Project {
    const project = this.getProjectById(id);
    if (project.ownerId !== identity.userId) {
      throw new ProjectAccessDeniedError("You are not authorized to view this project");
    }
    return project;
  }

  getStatus(id: string, identity: RequestIdentity): Project {
    return this.getAccessibleProject(id, identity);
  }
}