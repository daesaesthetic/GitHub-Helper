import type { RequestIdentity } from "../identity.js";
import { ProjectIntelligenceService } from "../intelligence/project-intelligence-service.js";
import type { RepositoryDevelopmentTrends } from "../intelligence/intelligence.js";

export class GetProjectTrends {
  constructor(private readonly intelligence: ProjectIntelligenceService) {}

  execute(projectId: string, identity: RequestIdentity): Promise<RepositoryDevelopmentTrends> {
    return this.intelligence.getProjectTrends(projectId, identity);
  }
}