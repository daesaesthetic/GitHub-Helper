import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import type { GitHubStatus } from "../github/github-service.js";

export interface ProjectStatusResult {
  name: string;
  status: string;
  description: string;
  ownerId: string;
  integrations: string[];
  github?: GitHubStatus;
}

export class GetProjectStatus {
  constructor(private readonly projects: ProjectService) {}

  async execute(projectId: string, identity: RequestIdentity): Promise<ProjectStatusResult> {
    const project = this.projects.getStatus(projectId, identity);
    let github: GitHubStatus | undefined;
    if (project.integrations.github && this.projects.getGitHubService()) {
      github = await this.projects.getGitHubService()!.getRepositoryStatus(project.integrations.github);
    } else if (!project.integrations.github) {
      github = { connected: false, reason: "not_configured" };
    }
    return {
      name: project.name,
      status: project.status,
      description: project.description,
      ownerId: project.ownerId,
      integrations: project.integrationReferences,
      github
    };
  }
}