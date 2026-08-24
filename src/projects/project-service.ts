import type { RequestIdentity } from "../identity.js";
import type { Project } from "./project.js";
import type { GitHubService } from "../github/github-service.js";
import type { GitHubStatus } from "../github/github-service.js";
import type { GitHubRepositoryContextStatus } from "../github/github-service.js";
import type { GitHubRepositoryActivityStatus } from "../github/github-service.js";
import type { GitHubCredentialResolver } from "../github-connections/github-credential-resolver.js";

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

  private credentials?: GitHubCredentialResolver;

  setCredentialResolver(credentials: GitHubCredentialResolver): void {
    this.credentials = credentials;
  }

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

  async getGitHubStatus(project: Project, identity?: RequestIdentity): Promise<GitHubStatus> {
    const resolved = await this.resolveGitHub(project, identity);
    if (resolved === "unavailable") return { connected: false, reason: "unavailable" };
    if (!resolved) {
      return { connected: false, reason: "not_configured" };
    }
    return resolved.github.getRepositoryStatus(resolved.reference);
  }

  async getGitHubRepositoryContext(project: Project, identity?: RequestIdentity): Promise<GitHubRepositoryContextStatus> {
    const resolved = await this.resolveGitHub(project, identity);
    if (resolved === "unavailable") return { connected: false, reason: "unavailable" };
    if (!resolved) {
      return { connected: false, reason: "not_configured" };
    }
    return resolved.github.getRepositoryContext(resolved.reference);
  }

  async getGitHubActivity(
    project: Project,
    limit = 5,
    identity?: RequestIdentity
  ): Promise<GitHubRepositoryActivityStatus> {
    const resolved = await this.resolveGitHub(project, identity);
    if (resolved === "unavailable") return { connected: false, reason: "unavailable" };
    if (!resolved) {
      return { connected: false, reason: "not_configured" };
    }
    return resolved.github.getRepositoryActivity(resolved.reference, limit);
  }

  private async resolveGitHub(project: Project, identity?: RequestIdentity) {
    if (!this.github) return undefined;
    if (!identity || !this.credentials) {
      return project.integrations.github ? { github: this.github, reference: project.integrations.github } : undefined;
    }
    let credential;
    try {
      credential = await this.credentials.resolve(project.id, identity);
    } catch {
      return "unavailable" as const;
    }
    if (!credential.token) return undefined;
    const association = credential.association;
    const reference = association
      ? { owner: association.owner, repository: association.repository, repositoryId: String(association.repositoryId) }
      : project.integrations.github;
    return reference ? { github: this.github.withCredential(credential.token), reference } : undefined;
  }
}