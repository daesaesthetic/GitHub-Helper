import type { RequestIdentity } from "../identity.js";
import type { ProjectService } from "../projects/project-service.js";
import {
  assertProjectOwner, createAuthorizationState, createDiscordAccount,
  createGitHubConnection, createGitHubIdentity, createProjectGitHubRepository,
  GitHubAuthorizationStateError, GitHubConnectionAccessDeniedError,
  GitHubConnectionNotFoundError, type GitHubAuthorizationState, type GitHubConnection,
  type ProjectGitHubRepository
} from "./github-connection.js";
import type {
  DiscordAccountStore, GitHubAuthorizationStateStore, GitHubConnectionStore,
  GitHubIdentityStore, ProjectGitHubRepositoryStore
} from "./github-connection-store.js";

export class DiscordAccountService {
  constructor(private readonly store: DiscordAccountStore) {}
  async ensure(discordUserId: string) { return this.store.upsert(createDiscordAccount({ discordUserId })); }
  findById(id: string) { return this.store.findById(id); }
  findByDiscordUserId(id: string) { return this.store.findByDiscordUserId(id); }
}

export class GitHubIdentityService {
  constructor(private readonly store: GitHubIdentityStore) {}
  async upsert(input: { githubUserId: number; login: string; lastVerifiedAt?: string }) {
    return this.store.upsert(createGitHubIdentity(input));
  }
  findById(id: string) { return this.store.findById(id); }
  findByGitHubUserId(id: number) { return this.store.findByGitHubUserId(id); }
}

export class GitHubConnectionService {
  constructor(
    private readonly store: GitHubConnectionStore,
    private readonly accounts: DiscordAccountService,
    private readonly identities: GitHubIdentityService
  ) {}
  async connect(input: Omit<Parameters<typeof createGitHubConnection>[0], "discordAccountId" | "githubIdentityId"> & { discordUserId: string; githubUserId: number; login: string }) {
    const account = await this.accounts.ensure(input.discordUserId);
    const identity = await this.identities.upsert({ githubUserId: input.githubUserId, login: input.login });
    return this.store.upsert(createGitHubConnection({ ...input, discordAccountId: account.id, githubIdentityId: identity.id }));
  }
  async getOwned(id: string, identity: RequestIdentity): Promise<GitHubConnection> {
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    const connection = await this.store.findById(id);
    if (!connection) throw new GitHubConnectionNotFoundError("GitHub connection was not found");
    if (!account || connection.discordAccountId !== account.id) throw new GitHubConnectionAccessDeniedError("GitHub connection access denied");
    return connection;
  }
  async setStatus(id: string, status: GitHubConnection["status"], identity: RequestIdentity) {
    const connection = await this.getOwned(id, identity);
    return this.store.upsert({ ...connection, status, updatedAt: new Date().toISOString(), disconnectedAt: status === "active" ? undefined : new Date().toISOString() });
  }
  async markInstallationStatus(installationId: number, status: "revoked" | "suspended") {
    const connection = await this.store.findByInstallationId(installationId);
    if (!connection || connection.status !== "active") return connection;
    return this.store.upsert({
      ...connection,
      status,
      updatedAt: new Date().toISOString(),
      disconnectedAt: new Date().toISOString()
    });
  }
  async listOwned(identity: RequestIdentity) {
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    return account ? this.store.listByDiscordAccountId(account.id) : [];
  }
}

export class GitHubRepositoryAssociationService {
  constructor(
    private readonly store: ProjectGitHubRepositoryStore,
    private readonly connections: GitHubConnectionStore,
    private readonly accounts: DiscordAccountService,
    private readonly projects: ProjectService
  ) {}
  async associate(input: Omit<Parameters<typeof createProjectGitHubRepository>[0], "now">, identity: RequestIdentity): Promise<ProjectGitHubRepository> {
    assertProjectOwner(this.projects, input.projectId, identity);
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    const connection = await this.connections.findById(input.connectionId);
    if (!account || !connection || connection.discordAccountId !== account.id || connection.status !== "active") {
      throw new GitHubConnectionAccessDeniedError("GitHub connection is not available to this project owner");
    }
    return this.store.upsert(createProjectGitHubRepository(input));
  }
  async getAuthorized(projectId: string, identity: RequestIdentity) {
    assertProjectOwner(this.projects, projectId, identity);
    const association = await this.store.findByProjectId(projectId);
    if (!association) throw new GitHubConnectionNotFoundError("Project GitHub repository was not found");
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    const connection = await this.connections.findById(association.connectionId);
    if (!account || !connection || connection.discordAccountId !== account.id || connection.status !== "active") {
      throw new GitHubConnectionAccessDeniedError("Project GitHub connection access denied");
    }
    return { association, connection };
  }
  async findAuthorized(projectId: string, identity: RequestIdentity) {
    assertProjectOwner(this.projects, projectId, identity);
    const association = await this.store.findByProjectId(projectId);
    return association ? this.getAuthorized(projectId, identity) : undefined;
  }
  async findForAuthorizedProject(projectId: string, identity: RequestIdentity) {
    assertProjectOwner(this.projects, projectId, identity);
    return this.store.findByProjectId(projectId);
  }
}

export class AuthorizationStateService {
  constructor(private readonly store: GitHubAuthorizationStateStore, private readonly accounts: DiscordAccountService) {}
  async create(input: { discordUserId: string; operation: GitHubAuthorizationState["operation"]; projectId?: string; ttlMs?: number }) {
    const account = await this.accounts.ensure(input.discordUserId);
    return this.store.create(createAuthorizationState({ ...input, discordAccountId: account.id }));
  }
  async consume(nonce: string, identity: RequestIdentity) {
    const account = await this.accounts.findByDiscordUserId(identity.userId);
    if (!account) throw new GitHubAuthorizationStateError("Authorization state owner mismatch");
    const state = await this.store.consume(nonce, account.id, new Date());
    if (!state) throw new GitHubAuthorizationStateError("Authorization state is invalid, expired, already used, or owned by another user");
    return state;
  }
  async consumeByNonce(nonce: string) {
    const state = await this.store.find(nonce);
    if (!state) throw new GitHubAuthorizationStateError("Authorization state is invalid");
    const consumed = await this.store.consume(nonce, state.discordAccountId, new Date());
    if (!consumed) throw new GitHubAuthorizationStateError("Authorization state is invalid, expired, or already used");
    return consumed;
  }
  getAccount(id: string) { return this.accounts.findById(id); }
}