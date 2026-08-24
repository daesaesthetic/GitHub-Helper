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
  list(): Project[];
  save(project: Project): Project;
}

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects: Project[];

  constructor(project: Project | Project[]) {
    this.projects = Array.isArray(project) ? [...project] : [project];
  }

  findById(id: string): Project | undefined {
    return this.projects.find((project) => project.id === id);
  }

  list(): Project[] {
    return [...this.projects];
  }

  save(project: Project): Project {
    const index = this.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) this.projects[index] = project;
    else this.projects.push(project);
    return project;
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

  getAccessibleProjects(identity: RequestIdentity): Project[] {
    return this.repository.list().filter((project) => project.ownerId === identity.userId);
  }

  createProject(input: {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    github: { owner: string; repository: string; repositoryId?: string };
  }, identity: RequestIdentity): Project {
    if (input.ownerId !== identity.userId) {
      throw new ProjectAccessDeniedError("You are not authorized to create this project");
    }
    const existing = this.repository.findById(input.id);
    if (existing) return existing;
    return this.repository.save({
      id: input.id,
      name: input.name,
      ownerId: input.ownerId,
      description: input.description,
      status: "Development",
      metadata: { source: "github-repository" },
      integrationReferences: ["github"],
      integrations: { github: input.github }
    });
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