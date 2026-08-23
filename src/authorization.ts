import type { RequestIdentity } from "./identity.js";
import type { Project } from "./projects/project.js";
import { ProjectAccessDeniedError } from "./projects/project-service.js";

export class AuthorizationService {
  assertCanViewProject(identity: RequestIdentity, project: Project): void {
    if (identity.userId !== project.ownerId) {
      throw new ProjectAccessDeniedError("You are not authorized to view this project");
    }
  }
}