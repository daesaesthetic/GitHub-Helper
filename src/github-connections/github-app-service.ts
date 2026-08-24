import type { GitHubAppConfig } from "../config.js";
import type { RequestIdentity } from "../identity.js";
import type { ProjectService } from "../projects/project-service.js";
import {
  AuthorizationStateService,
  GitHubConnectionService,
  GitHubRepositoryAssociationService
} from "./github-connection-services.js";
import { GitHubAppAuthenticationError, GitHubAppAuthenticator, type InstallationRepository } from "./github-app-authenticator.js";
import { GitHubConnectionNotFoundError } from "./github-connection.js";

export class GitHubAppConfigurationError extends Error {}

export interface GitHubAccessibleRepository {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  htmlUrl: string;
}

export class GitHubAppService {
  constructor(
    private readonly config: GitHubAppConfig | undefined,
    private readonly authorization: AuthorizationStateService,
    private readonly connections: GitHubConnectionService,
    private readonly _associations: GitHubRepositoryAssociationService,
    private readonly projects: ProjectService,
    private readonly fetcher: typeof fetch = fetch,
    private readonly authenticator = new GitHubAppAuthenticator(config, fetcher)
  ) {}

  async createConnectUrl(projectId: string, identity: RequestIdentity): Promise<string> {
    projectId = this.projects.getAccessibleProject(projectId, identity).id;
    if (!this.config) throw new GitHubAppConfigurationError("GitHub App authorization is not configured");
    const state = await this.authorization.create({
      discordUserId: identity.userId,
      operation: "connect",
      projectId
    });
    const url = new URL(`https://github.com/apps/${encodeURIComponent(this.config.slug)}/installations/new`);
    url.searchParams.set("state", state.stateNonce);
    return url.toString();
  }

  async completeCallback(params: URLSearchParams): Promise<{ projectId?: string; login: string }> {
    if (!this.config) throw new GitHubAppConfigurationError("GitHub App authorization is not configured");
    const nonce = params.get("state");
    if (!nonce) throw new Error("Missing authorization state");
    if (params.get("error")) throw new Error("GitHub authorization was denied");
    const code = params.get("code");
    if (!code) throw new Error("Missing GitHub authorization code");
    const state = await this.authorization.consumeByNonce(nonce);
    const token = await this.exchangeCode(code);
    const client = (await import("../github/github-client.js")).GitHubClient;
    const user = await new client(token, this.fetcher).getAuthenticatedUser();
    const installationId = Number(params.get("installation_id"));
    if (!Number.isSafeInteger(installationId) || installationId < 1) {
      throw new Error("Missing GitHub installation");
    }
    const installation = await this.authenticator.getInstallation(installationId);
    const account = await this.authorization.getAccount(state.discordAccountId);
    if (!account) throw new Error("Authorization account was not found");
    await this.connections.connect({
      id: `github-connection:${user.id}`,
      discordUserId: account.discordUserId,
      githubUserId: user.id,
      login: user.login,
      installationId,
      githubAccountId: installation.accountId,
      githubAccountLogin: installation.accountLogin,
      githubAccountType: installation.accountType,
      permissionState: "read_only",
      status: "active"
    });
    return { projectId: state.projectId, login: user.login };
  }

  async discoverRepositories(projectId: string, identity: RequestIdentity) {
    projectId = this.projects.getAccessibleProject(projectId, identity).id;
    const connection = (await this.connections.listOwned(identity))
      .find((item) => item.status === "active" && item.installationId !== undefined);
    if (!connection?.installationId) throw new GitHubConnectionNotFoundError("No active GitHub installation is connected");
    return { connection, repositories: await this.listConnectionRepositories(connection.installationId) };
  }

  async selectRepository(projectId: string, connectionId: string, repositoryId: number, identity: RequestIdentity) {
    projectId = this.projects.getAccessibleProject(projectId, identity).id;
    const connection = await this.connections.getOwned(connectionId, identity);
    if (connection.status !== "active" || connection.installationId === undefined) {
      throw new GitHubConnectionNotFoundError("GitHub installation is not active");
    }
    const repositories = await this.listConnectionRepositories(connection.installationId);
    const repository = repositories.find((item) => item.id === repositoryId);
    if (!repository) throw new GitHubConnectionNotFoundError("Repository is not accessible through this installation");
    return this._associations.associate({
      id: `project-repository:${projectId}`,
      projectId,
      connectionId,
      repositoryId: repository.id,
      owner: repository.owner,
      repository: repository.name,
      repositoryUrl: repository.htmlUrl,
      status: "active"
    }, identity);
  }

  async status(projectId: string, identity: RequestIdentity) {
    projectId = this.projects.getAccessibleProject(projectId, identity).id;
    const connections = await this.connections.listOwned(identity);
    const connection = connections.find((item) => item.status === "active") ?? connections[0];
    const association = await this._associations.findForAuthorizedProject(projectId, identity);
    return { connection, association };
  }

  async disconnect(identity: RequestIdentity) {
    const connection = (await this.connections.listOwned(identity))
      .find((item) => item.status === "active");
    if (!connection) return false;
    await this.connections.setStatus(connection.id, "disconnected", identity);
    return true;
  }

  private async listConnectionRepositories(installationId: number): Promise<InstallationRepository[]> {
    try {
      return await this.authenticator.listRepositories(installationId);
    } catch (error) {
      if (
        error instanceof GitHubAppAuthenticationError &&
        (error.failureKind === "revoked" || error.failureKind === "suspended")
      ) {
        await this.connections.markInstallationStatus(installationId, error.failureKind);
      }
      throw error;
    }
  }

  private async exchangeCode(code: string): Promise<string> {
    const response = await this.fetcher("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.config!.clientId, client_secret: this.config!.clientSecret, code })
    });
    if (!response.ok) throw new Error("GitHub authorization exchange failed");
    const body = await response.json() as { access_token?: string };
    if (!body.access_token) throw new Error("GitHub authorization exchange returned no token");
    return body.access_token;
  }
}