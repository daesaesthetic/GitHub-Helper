import type { RequestIdentity } from "../identity.js";
import { ProjectService } from "../projects/project-service.js";
import type { ContextRecord } from "../context/context.js";
import { ContextService } from "../context/context-service.js";
import {
  GitHubContextIngestionService,
  type ContextIngestionResult
} from "../context/github-context-ingestion-service.js";

export interface ProjectContextResult {
  projectName: string;
  records: ContextRecord[];
  ingestion: ContextIngestionResult;
}

export class GetProjectContext {
  constructor(
    private readonly projects: ProjectService,
    private readonly context: ContextService,
    private readonly ingestion: GitHubContextIngestionService
  ) {}

  async execute(projectId: string, identity: RequestIdentity): Promise<ProjectContextResult> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    const ingestion = await this.ingestion.ingestProject(project);
    const records = await this.context.getProjectContext(projectId, identity);
    return {
      projectName: project.name,
      records,
      ingestion
    };
  }
}