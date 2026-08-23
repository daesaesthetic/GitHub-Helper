import type { Project } from "../projects/project.js";
import { ProjectService } from "../projects/project-service.js";
import type { ContextRecord } from "./context.js";
import { isSecretBearingPath } from "./context.js";
import { ContextService } from "./context-service.js";

export interface ContextIngestionResult {
  ingested: number;
  updated: number;
  reason?: "not_configured" | "unauthorized" | "not_found" | "rate_limited" | "unavailable";
}

export class GitHubContextIngestionService {
  constructor(
    private readonly projects: ProjectService,
    private readonly context: ContextService
  ) {}

  async ingestProject(project: Project): Promise<ContextIngestionResult> {
    const github = await this.projects.getGitHubRepositoryContext(project);
    if (!github.connected) return { ingested: 0, updated: 0, reason: github.reason };

    const repository = github.repository;
    const records: ContextRecord[] = [];
    const repositoryId = String(repository.id);
    const repositoryIdentity = `github:repository:${repositoryId}`;
    records.push(await this.context.storeProjectContext({
      id: `context:${project.id}:${repositoryIdentity}`,
      projectId: project.id,
      scope: "project",
      sourceType: "github_repository",
      sourceIdentity: repositoryIdentity,
      content: JSON.stringify({
        fullName: repository.fullName,
        visibility: repository.private ? "private" : "public",
        defaultBranch: repository.defaultBranch,
        status: repository.archived ? "archived" : repository.disabled ? "disabled" : "active",
        url: repository.htmlUrl
      }),
      metadata: {
        visibility: repository.private ? "private" : "public",
        defaultBranch: repository.defaultBranch,
        status: repository.archived ? "archived" : repository.disabled ? "disabled" : "active"
      },
      provenance: {
        repositoryOwner: project.integrations.github!.owner,
        repositoryName: project.integrations.github!.repository,
        repositoryId,
        sourceUrl: repository.htmlUrl,
        sourceReference: repository.defaultBranch
      },
      sourceTimestamp: repository.updatedAt
    }));

    if (github.readme && !isSecretBearingPath(github.readme.path)) {
      const readmeIdentity = `github:readme:${repositoryId}:${github.readme.path}`;
      records.push(await this.context.storeProjectContext({
        id: `context:${project.id}:${readmeIdentity}`,
        projectId: project.id,
        scope: "project",
        sourceType: "github_documentation",
        sourceIdentity: readmeIdentity,
        content: github.readme.content,
        metadata: {
          path: github.readme.path,
          sha: github.readme.sha
        },
        provenance: {
          repositoryOwner: project.integrations.github!.owner,
          repositoryName: project.integrations.github!.repository,
          repositoryId,
          filePath: github.readme.path,
          sourceUrl: github.readme.htmlUrl,
          sourceReference: github.readme.sha
        }
      }));
    }

    return { ingested: records.length, updated: records.length };
  }
}