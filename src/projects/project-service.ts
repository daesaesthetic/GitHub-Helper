import type { RequestIdentity } from "../identity.js";
import type { Project } from "./project.js";
import type { GitHubService } from "../github/github-service.js";
import type { GitHubStatus } from "../github/github-service.js";
import type { GitHubRepositoryContextStatus } from "../github/github-service.js";

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
  constructor(
    private readonly repository: ProjectRepository,
    private readonly github?: GitHubService
  ) {}

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

  async getGitHubStatus(project: Project): Promise<GitHubStatus> {
    if (!project.integrations.github || !this.github) {
      return { connected: false, reason: "not_configured" };
    }
    return this.github.getRepositoryStatus(project.integrations.github);
  }

  async getGitHubRepositoryContext(project: Project): Promise<GitHubRepositoryContextStatus> {
    if (!project.integrations.github || !this.github) {
      return { connected: false, reason: "not_configured" };
    }
    return this.github.getRepositoryContext(project.integrations.github);
  }
}