import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import { ProjectRealityBootstrap } from "../reality/reality-bootstrap.js";
import { RealityService } from "../reality/reality-service.js";
import type { RealityRecord } from "../reality/reality.js";

export interface ProjectRealityResult {
  projectName: string;
  records: RealityRecord[];
}

export class GetProjectReality {
  constructor(
    private readonly projects: ProjectService,
    private readonly reality: RealityService,
    private readonly bootstrap: ProjectRealityBootstrap
  ) {}

  async execute(projectId: string, identity: RequestIdentity): Promise<ProjectRealityResult> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    await this.bootstrap.ensureInitialFacts(project, identity);
    return {
      projectName: project.name,
      records: await this.reality.getProjectReality(projectId, identity)
    };
  }
}