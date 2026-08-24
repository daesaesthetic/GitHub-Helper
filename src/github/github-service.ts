import type { GitHubProjectReference } from "../projects/project.js";
import {
  GitHubApiError,
  GitHubClient,
  type GitHubReadme,
  type GitHubCommitActivity,
  type GitHubIssueActivity,
  type GitHubPullRequestActivity,
  type GitHubRepository,
  type GitHubUser
} from "./github-client.js";

export interface GitHubRepositoryStatus {
  connected: true;
  account: GitHubUser;
  repository: GitHubRepository;
}

export interface GitHubUnavailable {
  connected: false;
  reason: "not_configured" | "unauthorized" | "not_found" | "rate_limited" | "unavailable";
}

export type GitHubStatus = GitHubRepositoryStatus | GitHubUnavailable;

export interface GitHubRepositoryContext {
  connected: true;
  repository: GitHubRepository;
  readme?: GitHubReadme;
}

export type GitHubRepositoryContextStatus = GitHubRepositoryContext | GitHubUnavailable;

export interface GitHubRepositoryActivity {
  connected: true;
  retrievedAt: string;
  commits: GitHubCommitActivity[];
  issues: GitHubIssueActivity[];
  pullRequests: GitHubPullRequestActivity[];
}

export type GitHubRepositoryActivityStatus = GitHubRepositoryActivity | GitHubUnavailable;

export class GitHubService {
  constructor(private readonly client: GitHubClient) {}

  getAuthenticatedUser(): Promise<GitHubUser> {
    return this.client.getAuthenticatedUser();
  }

  withCredential(token: string): GitHubService {
    return new GitHubService(this.client.withToken(token));
  }

  async getRepositoryStatus(reference: GitHubProjectReference): Promise<GitHubStatus> {
    try {
      const [account, repository] = await Promise.all([
        this.client.getAuthenticatedUser(),
        this.client.getRepository(reference.owner, reference.repository)
      ]);
      return { connected: true, account, repository };
    } catch (error) {
      const reason = error instanceof GitHubApiError ? error.kind : "unavailable";
      return {
        connected: false,
        reason: reason === "invalid_response" ? "unavailable" : reason
      };
    }
  }

  async getRepositoryContext(
    reference: GitHubProjectReference
  ): Promise<GitHubRepositoryContextStatus> {
    try {
      const repository = await this.client.getRepository(reference.owner, reference.repository);
      let readme: GitHubReadme | undefined;
      try {
        readme = await this.client.getReadme(reference.owner, reference.repository);
      } catch (error) {
        if (!(error instanceof GitHubApiError) || error.kind !== "not_found") throw error;
      }
      return { connected: true, repository, readme };
    } catch (error) {
      const reason = error instanceof GitHubApiError ? error.kind : "unavailable";
      return {
        connected: false,
        reason: reason === "invalid_response" ? "unavailable" : reason
      };
    }
  }

  async getRepositoryActivity(
    reference: GitHubProjectReference,
    limit = 5
  ): Promise<GitHubRepositoryActivityStatus> {
    try {
      const [commits, issues, pullRequests] = await Promise.all([
        this.client.getCommits(reference.owner, reference.repository, limit),
        this.client.getIssues(reference.owner, reference.repository, limit),
        this.client.getPullRequests(reference.owner, reference.repository, limit)
      ]);
      return {
        connected: true,
        retrievedAt: new Date().toISOString(),
        commits,
        issues,
        pullRequests
      };
    } catch (error) {
      const reason = error instanceof GitHubApiError ? error.kind : "unavailable";
      return {
        connected: false,
        reason: reason === "invalid_response" ? "unavailable" : reason
      };
    }
  }
}