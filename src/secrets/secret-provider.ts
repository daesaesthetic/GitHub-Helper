import type { RequestIdentity } from "../identity.js";
import type { ProjectService } from "../projects/project-service.js";

export interface SecretMetadata {
  name: string;
  scope: "project";
  configured: boolean;
  provider: "replit-environment";
}

export interface SecretProvider {
  listMetadata(projectId: string, identity: RequestIdentity): Promise<SecretMetadata[]>;
}

const KNOWN_PROJECT_SECRET_NAMES = [
  "DISCORD_TOKEN",
  "GITHUB_TOKEN",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_CLIENT_SECRET",
  "SESSION_SECRET",
  "OPENAI_API_KEY",
  "XAI_API_KEY",
  "MINIMAX_API_KEY"
] as const;

export class EnvironmentSecretProvider implements SecretProvider {
  constructor(private readonly projects: ProjectService) {}

  async listMetadata(projectId: string, identity: RequestIdentity): Promise<SecretMetadata[]> {
    const project = this.projects.getAccessibleProject(projectId, identity);
    return KNOWN_PROJECT_SECRET_NAMES.map((name) => ({
      name,
      scope: "project" as const,
      configured: Boolean(process.env[name]),
      provider: "replit-environment" as const
    })).filter((secret) => secret.configured && project.id.length > 0);
  }
}

export class SecretProviderUnavailableError extends Error {
  constructor(message = "Secure secret metadata is unavailable") {
    super(message);
    this.name = "SecretProviderUnavailableError";
  }
}