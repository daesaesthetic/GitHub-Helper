import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import type { GitHubRepositoryActivityStatus } from "./github-service.js";

export const DEFAULT_ACTIVITY_LIMIT = 5;

export class GitHubActivityService {
  constructor(private readonly projects: ProjectService) {}

  async getProjectActivity(
    projectId: string,
    identity: RequestIdentity,
    limit = DEFAULT_ACTIVITY_LIMIT
  ): Promise<GitHubRepositoryActivityStatus> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    return this.projects.getGitHubActivity(project, limit, identity);
  }
}