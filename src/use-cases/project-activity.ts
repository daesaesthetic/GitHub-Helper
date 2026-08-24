import type { RequestIdentity } from "../identity.js";
import { GitHubActivityService } from "../github/github-activity-service.js";
import type { GitHubRepositoryActivityStatus } from "../github/github-service.js";

export class GetProjectActivity {
  constructor(private readonly activity: GitHubActivityService) {}

  execute(
    projectId: string,
    identity: RequestIdentity,
    limit?: number
  ): Promise<GitHubRepositoryActivityStatus> {
    return this.activity.getProjectActivity(projectId, identity, limit);
  }
}