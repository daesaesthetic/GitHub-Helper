import type { RequestIdentity } from "../identity.js";
import type { Project } from "./project.js";
import type { GitHubService } from "../github/github-service.js";
import type { GitHubStatus } from "../github/github-service.js";
import type { GitHubRepositoryContextStatus } from "../github/github-service.js";
import type { GitHubRepositoryActivityStatus } from "../github/github-service.js";
import type { GitHubCredentialResolver } from "../github-connections/github-credential-resolver.js";

export class ProjectNotFoundError extends Error {}
export class ProjectAccessDeniedError extends Error {}
export class ProjectNameAmbiguousError extends Error {}

export interface ProjectRepository {
  findById(id: string): Project | undefined;
  list?(): Project[];
  save?(project: Project): Project;
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
    return (this.repository.list?.() ?? []).filter((project) => project.ownerId === identity.userId);
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
    if (!this.repository.save) throw new Error("Project persistence is unavailable");
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

  async createGitHubProject(
    input: { owner: string; repository: string; name: string },
    identity: RequestIdentity
  ): Promise<Project> {
    if (!this.github || !this.credentials) throw new Error("GitHub development access is not configured");
    const reference = normalizeGitHubRepositoryInput(input.owner, input.repository);
    const projectId = `github-${reference.owner}-${reference.repository}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const existing = this.repository.findById(projectId);
    if (existing) {
      if (existing.ownerId !== identity.userId) throw new ProjectAccessDeniedError("Project is owned by another user");
      return existing;
    }
    const credential = await this.credentials.resolveForIdentity(identity);
    const status = await this.github.withCredential(credential).getRepositoryStatus({
      owner: reference.owner,
      repository: reference.repository
    });
    if (!status.connected) throw new Error(`GitHub repository is ${status.reason}`);
    return this.createProject({
      id: projectId,
      name: input.name.trim() || status.repository.fullName,
      description: `GitHub project for ${status.repository.fullName}.`,
      ownerId: identity.userId,
      github: {
        owner: reference.owner,
        repository: reference.repository,
        repositoryId: String(status.repository.id)
      }
    }, identity);
  }

  getAccessibleProject(identifier: string, identity: RequestIdentity): Project {
    const exact = this.repository.findById(identifier);
    const matches = exact
      ? [exact]
      : (this.repository.list?.() ?? []).filter((project) =>
          project.ownerId === identity.userId &&
          project.name.trim().toLowerCase() === identifier.trim().toLowerCase()
        );
    if (matches.length > 1) {
      throw new ProjectNameAmbiguousError("More than one project has that name");
    }
    const project = matches[0];
    if (!project) throw new ProjectNotFoundError("Project was not found");
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

function normalizeGitHubRepositoryInput(ownerInput: string, repositoryInput: string): {
  owner: string;
  repository: string;
} {
  const owner = ownerInput.trim();
  const repositoryValue = repositoryInput.trim();
  if (!owner || !repositoryValue) throw new Error("GitHub owner and repository are required");

  let repository = repositoryValue;
  if (/^https?:\/\/github\.com\//i.test(repositoryValue)) {
    let parsed: URL;
    try {
      parsed = new URL(repositoryValue);
    } catch {
      throw new Error("GitHub repository URL is invalid");
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parsed.hostname.toLowerCase() !== "github.com" || parts.length !== 2) {
      throw new Error("GitHub repository URL must be https://github.com/{owner}/{repository}");
    }
    if (parts[0].toLowerCase() !== owner.toLowerCase()) {
      throw new Error("GitHub repository URL owner does not match the owner field");
    }
    repository = parts[1];
  }
  repository = repository.replace(/\.git$/i, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GitHub repository name is invalid");
  }
  return { owner, repository };
}