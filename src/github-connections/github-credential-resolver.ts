import type { RequestIdentity } from "../identity.js";
import type { ProjectService } from "../projects/project-service.js";
import type { GitHubConnection, ProjectGitHubRepository } from "./github-connection.js";
import type { GitHubInstallationFailureKind } from "./github-app-authenticator.js";
import type { DiscordAccountStore, GitHubConnectionStore, ProjectGitHubRepositoryStore } from "./github-connection-store.js";

export type GitHubCredentialSource = "user_owned_connection" | "explicit_project_connection" | "development_token" | "unavailable";
export interface ResolvedGitHubCredential {
  source: GitHubCredentialSource;
  token?: string;
  connection?: GitHubConnection;
  association?: ProjectGitHubRepository;
}
export interface GitHubInstallationCredentialProvider {
  createInstallationToken(installationId: number): Promise<{ token: string; expiresAt: string }>;
  onInstallationFailure?: (installationId: number, kind: "revoked" | "suspended") => Promise<void>;
}

export class GitHubCredentialResolver {
  constructor(
    private readonly projects: ProjectService,
    private readonly associations: ProjectGitHubRepositoryStore,
    private readonly connections: GitHubConnectionStore,
    private readonly accounts: DiscordAccountStore,
    private readonly developmentToken?: string,
    private readonly installations?: GitHubInstallationCredentialProvider
  ) {}

  async resolveForIdentity(identity: RequestIdentity): Promise<string> {
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    const connection = (await (account ? this.connections.listByDiscordAccountId(account.id) : []))
      .find((item) => item.status === "active" && item.installationId !== undefined);
    if (connection?.installationId && this.installations) {
      try {
        return (await this.installations.createInstallationToken(connection.installationId)).token;
      } catch {
        // ProjectService will use the development token only when available.
      }
    }
    if (this.developmentToken) return this.developmentToken;
    throw new Error("No GitHub credential is available");
  }

  async resolve(projectId: string, identity: RequestIdentity): Promise<ResolvedGitHubCredential> {
    this.projects.getAccessibleProject(projectId, identity);
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    const association = await this.associations.findByProjectId(projectId);
    if (account && association) {
      const connection = await this.connections.findById(association.connectionId);
      if (connection?.discordAccountId === account.id && connection.status === "active") {
        if (!this.installations) {
          return { source: "user_owned_connection", connection, association };
        }
        if (!connection.installationId) {
          return this.developmentToken
            ? { source: "development_token" }
            : { source: "unavailable", connection, association };
        }
        try {
          const credential = await this.installations.createInstallationToken(connection.installationId);
          return { source: "user_owned_connection", token: credential.token, connection, association };
        } catch (error) {
          const kind = error && typeof error === "object" && "failureKind" in error
            ? (error as { failureKind?: GitHubInstallationFailureKind }).failureKind
            : undefined;
          if ((kind === "revoked" || kind === "suspended") && this.installations.onInstallationFailure) {
            await this.installations.onInstallationFailure(connection.installationId, kind);
          }
          if (kind === "revoked" || kind === "suspended") {
            if (this.developmentToken) return { source: "development_token" as const };
          }
          throw error;
        }
      }
    }
    if (this.developmentToken) return { source: "development_token", token: this.developmentToken };
    return { source: "unavailable" };
  }
}