import type { RequestIdentity } from "../identity.js";
import type { ProjectService } from "../projects/project-service.js";
import type { GitHubConnection, ProjectGitHubRepository } from "./github-connection.js";
import type { DiscordAccountStore, GitHubConnectionStore, ProjectGitHubRepositoryStore } from "./github-connection-store.js";

export type GitHubCredentialSource = "user_owned_connection" | "explicit_project_connection" | "development_token" | "unavailable";
export interface ResolvedGitHubCredential {
  source: GitHubCredentialSource;
  token?: string;
  connection?: GitHubConnection;
  association?: ProjectGitHubRepository;
}

export class GitHubCredentialResolver {
  constructor(
    private readonly projects: ProjectService,
    private readonly associations: ProjectGitHubRepositoryStore,
    private readonly connections: GitHubConnectionStore,
    private readonly accounts: DiscordAccountStore,
    private readonly developmentToken?: string
  ) {}

  async resolve(projectId: string, identity: RequestIdentity): Promise<ResolvedGitHubCredential> {
    this.projects.getAccessibleProject(projectId, identity);
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    const association = await this.associations.findByProjectId(projectId);
    if (account && association) {
      const connection = await this.connections.findById(association.connectionId);
      if (connection?.discordAccountId === account.id && connection.status === "active") {
        return { source: "user_owned_connection", connection, association };
      }
    }
    if (this.developmentToken) return { source: "development_token", token: this.developmentToken };
    return { source: "unavailable" };
  }
}