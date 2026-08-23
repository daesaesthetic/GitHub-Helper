import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";

export interface ProjectStatusResult {
  name: string;
  status: string;
  description: string;
  ownerId: string;
  integrations: string[];
}

export class GetProjectStatus {
  constructor(private readonly projects: ProjectService) {}

  execute(projectId: string, identity: RequestIdentity): ProjectStatusResult {
    const project = this.projects.getStatus(projectId, identity);
    return {
      name: project.name,
      status: project.status,
      description: project.description,
      ownerId: project.ownerId,
      integrations: project.integrationReferences
    };
  }
}