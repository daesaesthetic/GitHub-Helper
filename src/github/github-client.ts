export interface GitHubUser {
  login: string;
  id: number;
  htmlUrl: string;
}

export interface GitHubRepository {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  archived: boolean;
  disabled: boolean;
}

export type GitHubFetch = typeof fetch;

export class GitHubApiError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly kind: "unauthorized" | "not_found" | "rate_limited" | "unavailable" | "invalid_response"
  ) {
    super(kind);
    this.name = "GitHubApiError";
  }
}

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: GitHubFetch = fetch
  ) {}

  async getAuthenticatedUser(): Promise<GitHubUser> {
    const response = await this.request("/user");
    const body = await this.readJson(response);
    if (
      typeof body.login !== "string" ||
      typeof body.id !== "number" ||
      typeof body.html_url !== "string"
    ) {
      throw new GitHubApiError(response.status, "invalid_response");
    }
    return { login: body.login, id: body.id, htmlUrl: body.html_url };
  }

  async getRepository(owner: string, repository: string): Promise<GitHubRepository> {
    const response = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`);
    const body = await this.readJson(response);
    if (
      typeof body.id !== "number" ||
      typeof body.full_name !== "string" ||
      typeof body.private !== "boolean" ||
      typeof body.default_branch !== "string" ||
      typeof body.html_url !== "string" ||
      typeof body.archived !== "boolean" ||
      typeof body.disabled !== "boolean"
    ) {
      throw new GitHubApiError(response.status, "invalid_response");
    }
    return {
      id: body.id,
      fullName: body.full_name,
      private: body.private,
      defaultBranch: body.default_branch,
      htmlUrl: body.html_url,
      archived: body.archived,
      disabled: body.disabled
    };
  }

  private async request(path: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.github.com${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "developer-intelligence-platform"
        }
      });
    } catch {
      throw new GitHubApiError(undefined, "unavailable");
    }
    if (response.ok) return response;
    if (response.status === 401 || response.status === 403) {
      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
        throw new GitHubApiError(response.status, "rate_limited");
      }
      throw new GitHubApiError(response.status, "unauthorized");
    }
    if (response.status === 404) throw new GitHubApiError(response.status, "not_found");
    if (response.status === 429 || response.status >= 500) {
      throw new GitHubApiError(response.status, response.status === 429 ? "rate_limited" : "unavailable");
    }
    throw new GitHubApiError(response.status, "unavailable");
  }

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    try {
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("not an object");
      }
      return body as Record<string, unknown>;
    } catch {
      throw new GitHubApiError(response.status, "invalid_response");
    }
  }
}