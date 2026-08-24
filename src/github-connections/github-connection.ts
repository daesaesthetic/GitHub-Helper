import { randomBytes, randomUUID } from "node:crypto";
import type { RequestIdentity } from "../identity.js";
import type { ProjectService } from "../projects/project-service.js";

export type ConnectionStatus = "active" | "disconnected" | "revoked" | "suspended";
export type AssociationStatus = "active" | "disconnected" | "unavailable";
export type AuthorizationOperation = "connect" | "associate_repository" | "reconnect";

export interface DiscordAccount {
  id: string;
  discordUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubIdentity {
  id: string;
  githubUserId: number;
  login: string;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

export interface GitHubConnection {
  id: string;
  discordAccountId: string;
  githubIdentityId: string;
  installationId?: number;
  githubAccountId?: number;
  githubAccountLogin?: string;
  githubAccountType?: "User" | "Organization";
  permissionState: "read_only" | "unknown" | "insufficient";
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
  disconnectedAt?: string;
}

export interface ProjectGitHubRepository {
  id: string;
  projectId: string;
  connectionId: string;
  repositoryId: number;
  owner: string;
  repository: string;
  repositoryUrl: string;
  status: AssociationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubAuthorizationState {
  id: string;
  discordAccountId: string;
  stateNonce: string;
  expiresAt: string;
  consumedAt?: string;
  operation: AuthorizationOperation;
  projectId?: string;
  createdAt: string;
}

export class GitHubConnectionValidationError extends Error {}
export class GitHubConnectionNotFoundError extends Error {}
export class GitHubConnectionAccessDeniedError extends Error {}
export class GitHubAuthorizationStateError extends Error {}

export function createDiscordAccount(input: {
  discordUserId: string;
  id?: string;
  now?: string;
}): DiscordAccount {
  if (!input.discordUserId.trim()) throw new GitHubConnectionValidationError("Discord user ID is required");
  const now = input.now ?? new Date().toISOString();
  return { id: input.id ?? `discord-account:${input.discordUserId}`, discordUserId: input.discordUserId, createdAt: now, updatedAt: now };
}

export function createGitHubIdentity(input: {
  githubUserId: number;
  login: string;
  id?: string;
  now?: string;
  lastVerifiedAt?: string;
}): GitHubIdentity {
  if (!Number.isSafeInteger(input.githubUserId) || input.githubUserId < 1) {
    throw new GitHubConnectionValidationError("GitHub user ID must be a positive integer");
  }
  if (!input.login.trim()) throw new GitHubConnectionValidationError("GitHub login is required");
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? `github-identity:${input.githubUserId}`,
    githubUserId: input.githubUserId,
    login: input.login,
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: input.lastVerifiedAt
  };
}

export function createGitHubConnection(input: Omit<GitHubConnection, "createdAt" | "updatedAt" | "status"> & {
  status?: ConnectionStatus;
  now?: string;
}): GitHubConnection {
  if (!input.discordAccountId || !input.githubIdentityId) {
    throw new GitHubConnectionValidationError("Connection identities are required");
  }
  if (input.installationId !== undefined && (!Number.isSafeInteger(input.installationId) || input.installationId < 1)) {
    throw new GitHubConnectionValidationError("Installation ID must be a positive integer");
  }
  const now = input.now ?? new Date().toISOString();
  return { ...input, status: input.status ?? "active", createdAt: now, updatedAt: now };
}

export function createProjectGitHubRepository(input: Omit<ProjectGitHubRepository, "createdAt" | "updatedAt" | "status"> & {
  status?: AssociationStatus;
  now?: string;
}): ProjectGitHubRepository {
  if (!input.projectId || !input.connectionId || !input.owner.trim() || !input.repository.trim() || !input.repositoryUrl.trim()) {
    throw new GitHubConnectionValidationError("Project repository association fields are required");
  }
  if (!Number.isSafeInteger(input.repositoryId) || input.repositoryId < 1) {
    throw new GitHubConnectionValidationError("Repository ID must be a positive integer");
  }
  const now = input.now ?? new Date().toISOString();
  return { ...input, status: input.status ?? "active", createdAt: now, updatedAt: now };
}

export function createAuthorizationState(input: {
  discordAccountId: string;
  operation: AuthorizationOperation;
  projectId?: string;
  ttlMs?: number;
  id?: string;
  now?: Date;
}): GitHubAuthorizationState {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 10 * 60 * 1000;
  if (!input.discordAccountId || !input.operation || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new GitHubConnectionValidationError("Authorization state fields are invalid");
  }
  return {
    id: input.id ?? `github-auth-state:${randomUUID()}`,
    discordAccountId: input.discordAccountId,
    stateNonce: randomBytes(32).toString("base64url"),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    operation: input.operation,
    projectId: input.projectId,
    createdAt: now.toISOString()
  };
}

export function assertProjectOwner(projects: ProjectService, projectId: string, identity: RequestIdentity): void {
  projects.getAccessibleProject(projectId, identity);
}