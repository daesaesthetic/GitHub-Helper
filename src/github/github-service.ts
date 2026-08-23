import type { GitHubProjectReference } from "../projects/project.js";
import { GitHubApiError, GitHubClient, type GitHubRepository, type GitHubUser } from "./github-client.js";

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

export class GitHubService {
  constructor(private readonly client: GitHubClient) {}

  getAuthenticatedUser(): Promise<GitHubUser> {
    return this.client.getAuthenticatedUser();
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
}