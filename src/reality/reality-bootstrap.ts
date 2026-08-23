import type { RequestIdentity } from "../identity.js";
import type { Project } from "../projects/project.js";
import { RealityService } from "./reality-service.js";

export class ProjectRealityBootstrap {
  constructor(private readonly reality: RealityService) {}

  async ensureInitialFacts(
    project: Project,
    identity: RequestIdentity
  ): Promise<void> {
    await this.reality.establishFact({
      id: `reality:${project.id}:identity`,
      projectId: project.id,
      factType: "project_identity",
      value: { name: project.name, description: project.description },
      verificationState: "verified"
    }, identity);
    await this.reality.establishFact({
      id: `reality:${project.id}:status`,
      projectId: project.id,
      factType: "project_status",
      value: { status: project.status },
      verificationState: "verified"
    }, identity);
    if (project.integrations.github) {
      await this.reality.establishFact({
        id: `reality:${project.id}:github`,
        projectId: project.id,
        factType: "github_repository",
        value: {
          owner: project.integrations.github.owner,
          repository: project.integrations.github.repository,
          ...(project.integrations.github.repositoryId
            ? { repositoryId: project.integrations.github.repositoryId }
            : {})
        },
        verificationState: "verified"
      }, identity);
    }
  }
}