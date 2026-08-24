import type { Pool } from "pg";
import type {
  DiscordAccount, GitHubAuthorizationState, GitHubConnection, GitHubIdentity,
  ProjectGitHubRepository
} from "./github-connection.js";

export interface DiscordAccountStore {
  upsert(account: DiscordAccount): Promise<DiscordAccount>;
  findByDiscordUserId(discordUserId: string): Promise<DiscordAccount | undefined>;
  findById(id: string): Promise<DiscordAccount | undefined>;
}
export interface GitHubIdentityStore {
  upsert(identity: GitHubIdentity): Promise<GitHubIdentity>;
  findByGitHubUserId(githubUserId: number): Promise<GitHubIdentity | undefined>;
  findById(id: string): Promise<GitHubIdentity | undefined>;
}
export interface GitHubConnectionStore {
  upsert(connection: GitHubConnection): Promise<GitHubConnection>;
  findById(id: string): Promise<GitHubConnection | undefined>;
  findByInstallationId(id: number): Promise<GitHubConnection | undefined>;
  listByDiscordAccountId(discordAccountId: string): Promise<GitHubConnection[]>;
}
export interface ProjectGitHubRepositoryStore {
  upsert(association: ProjectGitHubRepository): Promise<ProjectGitHubRepository>;
  findByProjectId(projectId: string): Promise<ProjectGitHubRepository | undefined>;
  findByRepositoryId(repositoryId: number): Promise<ProjectGitHubRepository[]>;
  deleteByProjectId(projectId: string): Promise<boolean>;
}
export interface GitHubAuthorizationStateStore {
  create(state: GitHubAuthorizationState): Promise<GitHubAuthorizationState>;
  consume(stateNonce: string, now: Date): Promise<GitHubAuthorizationState | undefined>;
  find(stateNonce: string): Promise<GitHubAuthorizationState | undefined>;
}

export class InMemoryDiscordAccountStore implements DiscordAccountStore {
  private readonly records = new Map<string, DiscordAccount>();
  async upsert(record: DiscordAccount) { const existing = [...this.records.values()].find((item) => item.discordUserId === record.discordUserId); const saved = { ...record, id: existing?.id ?? record.id, createdAt: existing?.createdAt ?? record.createdAt }; this.records.set(saved.id, saved); return saved; }
  async findByDiscordUserId(id: string) { return [...this.records.values()].find((item) => item.discordUserId === id); }
  async findById(id: string) { return this.records.get(id); }
}

export class InMemoryGitHubIdentityStore implements GitHubIdentityStore {
  private readonly records = new Map<string, GitHubIdentity>();
  async upsert(record: GitHubIdentity) { const existing = [...this.records.values()].find((item) => item.githubUserId === record.githubUserId); const saved = { ...record, id: existing?.id ?? record.id, createdAt: existing?.createdAt ?? record.createdAt }; this.records.set(saved.id, saved); return saved; }
  async findByGitHubUserId(id: number) { return [...this.records.values()].find((item) => item.githubUserId === id); }
  async findById(id: string) { return this.records.get(id); }
}

export class InMemoryGitHubConnectionStore implements GitHubConnectionStore {
  private readonly records = new Map<string, GitHubConnection>();
  async upsert(record: GitHubConnection) {
    if (record.installationId !== undefined) {
      const conflict = [...this.records.values()].find((item) => item.installationId === record.installationId && item.id !== record.id);
      if (conflict) throw new Error("GitHub installation is already connected");
    }
    const existing = this.records.get(record.id);
    const saved = { ...record, createdAt: existing?.createdAt ?? record.createdAt };
    this.records.set(saved.id, saved); return saved;
  }
  async findById(id: string) { return this.records.get(id); }
  async findByInstallationId(id: number) { return [...this.records.values()].find((item) => item.installationId === id); }
  async listByDiscordAccountId(id: string) { return [...this.records.values()].filter((item) => item.discordAccountId === id); }
}

export class InMemoryProjectGitHubRepositoryStore implements ProjectGitHubRepositoryStore {
  private readonly records = new Map<string, ProjectGitHubRepository>();
  async upsert(record: ProjectGitHubRepository) { const saved = { ...record, createdAt: this.records.get(record.id)?.createdAt ?? record.createdAt }; this.records.set(saved.id, saved); return saved; }
  async findByProjectId(id: string) { return [...this.records.values()].find((item) => item.projectId === id && item.status === "active"); }
  async findByRepositoryId(id: number) { return [...this.records.values()].filter((item) => item.repositoryId === id); }
  async deleteByProjectId(id: string) { const record = [...this.records.values()].find((item) => item.projectId === id); if (!record) return false; this.records.delete(record.id); return true; }
}

export class InMemoryGitHubAuthorizationStateStore implements GitHubAuthorizationStateStore {
  private readonly records = new Map<string, GitHubAuthorizationState>();
  async create(record: GitHubAuthorizationState) { this.records.set(record.stateNonce, record); return record; }
  async find(nonce: string) { return this.records.get(nonce); }
  async consume(nonce: string, now: Date) { const record = this.records.get(nonce); if (!record || record.consumedAt || new Date(record.expiresAt) <= now) return undefined; const consumed = { ...record, consumedAt: now.toISOString() }; this.records.set(nonce, consumed); return consumed; }
}

interface BaseRow { id: string; created_at: Date; updated_at: Date; }
function dates<T extends BaseRow>(row: T) { return { createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }; }

export class PostgresDiscordAccountStore implements DiscordAccountStore {
  constructor(private readonly pool: Pool) {}
  async upsert(r: DiscordAccount) { const q = await this.pool.query("INSERT INTO discord_accounts (id, discord_user_id, created_at, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (discord_user_id) DO UPDATE SET updated_at=EXCLUDED.updated_at RETURNING *", [r.id,r.discordUserId,r.createdAt,r.updatedAt]); return toAccount(q.rows[0]); }
  async findByDiscordUserId(id: string) { const q = await this.pool.query("SELECT * FROM discord_accounts WHERE discord_user_id=$1",[id]); return q.rows[0] ? toAccount(q.rows[0]) : undefined; }
  async findById(id: string) { const q = await this.pool.query("SELECT * FROM discord_accounts WHERE id=$1",[id]); return q.rows[0] ? toAccount(q.rows[0]) : undefined; }
}
function toAccount(r: any): DiscordAccount { return { id:r.id, discordUserId:r.discord_user_id, ...dates(r) }; }

export class PostgresGitHubIdentityStore implements GitHubIdentityStore {
  constructor(private readonly pool: Pool) {}
  async upsert(r: GitHubIdentity) { const q = await this.pool.query("INSERT INTO github_identities (id, github_user_id, login, last_verified_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (github_user_id) DO UPDATE SET login=EXCLUDED.login,last_verified_at=EXCLUDED.last_verified_at,updated_at=EXCLUDED.updated_at RETURNING *",[r.id,r.githubUserId,r.login,r.lastVerifiedAt ?? null,r.createdAt,r.updatedAt]); return toIdentity(q.rows[0]); }
  async findByGitHubUserId(id: number) { const q=await this.pool.query("SELECT * FROM github_identities WHERE github_user_id=$1",[id]); return q.rows[0] ? toIdentity(q.rows[0]) : undefined; }
  async findById(id: string) { const q=await this.pool.query("SELECT * FROM github_identities WHERE id=$1",[id]); return q.rows[0] ? toIdentity(q.rows[0]) : undefined; }
}
function toIdentity(r:any): GitHubIdentity { return { id:r.id, githubUserId:Number(r.github_user_id), login:r.login, ...dates(r), lastVerifiedAt:r.last_verified_at?.toISOString() }; }

export class PostgresGitHubConnectionStore implements GitHubConnectionStore {
  constructor(private readonly pool: Pool) {}
  async upsert(r: GitHubConnection) { const q=await this.pool.query("INSERT INTO github_connections (id,discord_account_id,github_identity_id,installation_id,github_account_id,github_account_login,github_account_type,permission_state,status,created_at,updated_at,disconnected_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,permission_state=EXCLUDED.permission_state,updated_at=EXCLUDED.updated_at,disconnected_at=EXCLUDED.disconnected_at RETURNING *",[r.id,r.discordAccountId,r.githubIdentityId,r.installationId??null,r.githubAccountId??null,r.githubAccountLogin??null,r.githubAccountType??null,r.permissionState,r.status,r.createdAt,r.updatedAt,r.disconnectedAt??null]); return toConnection(q.rows[0]); }
  async findById(id:string){const q=await this.pool.query("SELECT * FROM github_connections WHERE id=$1",[id]); return q.rows[0]?toConnection(q.rows[0]):undefined;}
  async findByInstallationId(id:number){const q=await this.pool.query("SELECT * FROM github_connections WHERE installation_id=$1",[id]); return q.rows[0]?toConnection(q.rows[0]):undefined;}
  async listByDiscordAccountId(id:string){const q=await this.pool.query("SELECT * FROM github_connections WHERE discord_account_id=$1 ORDER BY created_at",[id]); return q.rows.map(toConnection);}
}
function toConnection(r:any): GitHubConnection { return { id:r.id,discordAccountId:r.discord_account_id,githubIdentityId:r.github_identity_id,installationId:r.installation_id===null?undefined:Number(r.installation_id),githubAccountId:r.github_account_id===null?undefined:Number(r.github_account_id),githubAccountLogin:r.github_account_login??undefined,githubAccountType:r.github_account_type??undefined,permissionState:r.permission_state,status:r.status,...dates(r),disconnectedAt:r.disconnected_at?.toISOString() }; }

export class PostgresProjectGitHubRepositoryStore implements ProjectGitHubRepositoryStore {
  constructor(private readonly pool: Pool) {}
  async upsert(r:ProjectGitHubRepository){const q=await this.pool.query("INSERT INTO project_github_repositories (id,project_id,connection_id,repository_id,owner,repository,repository_url,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (project_id) DO UPDATE SET connection_id=EXCLUDED.connection_id,repository_id=EXCLUDED.repository_id,owner=EXCLUDED.owner,repository=EXCLUDED.repository,repository_url=EXCLUDED.repository_url,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at RETURNING *",[r.id,r.projectId,r.connectionId,r.repositoryId,r.owner,r.repository,r.repositoryUrl,r.status,r.createdAt,r.updatedAt]);return toAssociation(q.rows[0]);}
  async findByProjectId(id:string){const q=await this.pool.query("SELECT * FROM project_github_repositories WHERE project_id=$1 AND status='active'",[id]);return q.rows[0]?toAssociation(q.rows[0]):undefined;}
  async findByRepositoryId(id:number){const q=await this.pool.query("SELECT * FROM project_github_repositories WHERE repository_id=$1",[id]);return q.rows.map(toAssociation);}
  async deleteByProjectId(id:string){const q=await this.pool.query("UPDATE project_github_repositories SET status='disconnected',updated_at=NOW() WHERE project_id=$1 AND status='active'",[id]);return (q.rowCount??0)>0;}
}
function toAssociation(r:any):ProjectGitHubRepository{return{id:r.id,projectId:r.project_id,connectionId:r.connection_id,repositoryId:Number(r.repository_id),owner:r.owner,repository:r.repository,repositoryUrl:r.repository_url,status:r.status,...dates(r)};}

export class PostgresGitHubAuthorizationStateStore implements GitHubAuthorizationStateStore {
  constructor(private readonly pool: Pool) {}
  async create(r:GitHubAuthorizationState){const q=await this.pool.query("INSERT INTO github_authorization_states (id,discord_account_id,state_nonce,expires_at,consumed_at,operation,project_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[r.id,r.discordAccountId,r.stateNonce,r.expiresAt,r.consumedAt??null,r.operation,r.projectId??null,r.createdAt]);return toState(q.rows[0]);}
  async find(nonce:string){const q=await this.pool.query("SELECT * FROM github_authorization_states WHERE state_nonce=$1",[nonce]);return q.rows[0]?toState(q.rows[0]):undefined;}
  async consume(nonce:string,now:Date){const q=await this.pool.query("UPDATE github_authorization_states SET consumed_at=$1 WHERE state_nonce=$2 AND consumed_at IS NULL AND expires_at>$1 RETURNING *",[now.toISOString(),nonce]);return q.rows[0]?toState(q.rows[0]):undefined;}
}
function toState(r:any):GitHubAuthorizationState{return{id:r.id,discordAccountId:r.discord_account_id,stateNonce:r.state_nonce,expiresAt:r.expires_at.toISOString(),consumedAt:r.consumed_at?.toISOString(),operation:r.operation,projectId:r.project_id??undefined,createdAt:r.created_at.toISOString()};}