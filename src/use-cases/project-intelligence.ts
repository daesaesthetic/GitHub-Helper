import type { RequestIdentity } from "../identity.js";
import { ProjectIntelligenceService } from "../intelligence/project-intelligence-service.js";
import type { ProjectIntelligenceResult } from "../intelligence/intelligence.js";

export class GetProjectIntelligence {
  constructor(private readonly intelligence: ProjectIntelligenceService) {}

  execute(projectId: string, identity: RequestIdentity): Promise<ProjectIntelligenceResult> {
    return this.intelligence.getProjectIntelligence(projectId, identity);
  }
}