import type { RequestIdentity } from "../identity.js";
import type { SecretMetadata, SecretProvider } from "../secrets/secret-provider.js";
import type { ProjectService } from "../projects/project-service.js";

export class GetProjectSecrets {
  constructor(
    private readonly projects: ProjectService,
    private readonly provider: SecretProvider
  ) {}

  execute(projectId: string, identity: RequestIdentity): Promise<SecretMetadata[]> {
    this.projects.getAccessibleProject(projectId, identity);
    return this.provider.listMetadata(projectId, identity);
  }
}