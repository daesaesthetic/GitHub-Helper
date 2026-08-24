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
  updatedAt: string;
}

export interface GitHubReadme {
  path: string;
  sha: string;
  htmlUrl: string;
  content: string;
}

export interface GitHubCommitActivity {
  sha: string;
  author?: string;
  message: string;
  timestamp: string;
  htmlUrl: string;
}

export interface GitHubIssueActivity {
  number: number;
  title: string;
  state: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface GitHubPullRequestActivity {
  number: number;
  title: string;
  state: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
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
      typeof body.disabled !== "boolean" ||
      typeof body.updated_at !== "string"
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
      disabled: body.disabled,
      updatedAt: body.updated_at
    };
  }

  async getReadme(owner: string, repository: string): Promise<GitHubReadme> {
    const response = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/readme`
    );
    const body = await this.readJson(response);
    if (
      typeof body.path !== "string" ||
      typeof body.sha !== "string" ||
      typeof body.html_url !== "string" ||
      typeof body.content !== "string" ||
      body.encoding !== "base64"
    ) {
      throw new GitHubApiError(response.status, "invalid_response");
    }
    return {
      path: body.path,
      sha: body.sha,
      htmlUrl: body.html_url,
      content: Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8")
    };
  }

  getCommits(owner: string, repository: string, limit = 5): Promise<GitHubCommitActivity[]> {
    return this.getActivityList(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?per_page=${normalizeLimit(limit)}`,
      (body) => {
        if (
          typeof body.sha !== "string" ||
          typeof body.html_url !== "string" ||
          !isObject(body.commit) ||
          typeof body.commit.message !== "string" ||
          !isObject(body.commit.author) ||
          typeof body.commit.author.date !== "string"
        ) {
          throw new GitHubApiError(undefined, "invalid_response");
        }
        return {
          sha: body.sha,
          author: isObject(body.author) && typeof body.author.login === "string"
            ? body.author.login
            : isObject(body.commit.author) && typeof body.commit.author.name === "string"
              ? body.commit.author.name
              : undefined,
          message: body.commit.message.split("\n")[0] ?? body.commit.message,
          timestamp: body.commit.author.date,
          htmlUrl: body.html_url
        };
      }
    );
  }

  async getIssues(owner: string, repository: string, limit = 5): Promise<GitHubIssueActivity[]> {
    const bodies = await this.getActivityBodies(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues?state=all&sort=updated&direction=desc&per_page=${normalizeLimit(limit)}`
    );
    return bodies
      .filter((body) => !("pull_request" in body))
      .map((body) => {
        if (
          typeof body.number !== "number" ||
          typeof body.title !== "string" ||
          typeof body.state !== "string" ||
          typeof body.created_at !== "string" ||
          typeof body.updated_at !== "string" ||
          typeof body.html_url !== "string"
        ) {
          throw new GitHubApiError(undefined, "invalid_response");
        }
        return {
          number: body.number,
          title: body.title,
          state: body.state,
          author: isObject(body.user) && typeof body.user.login === "string" ? body.user.login : undefined,
          createdAt: body.created_at,
          updatedAt: body.updated_at,
          htmlUrl: body.html_url
        };
      });
  }

  getPullRequests(owner: string, repository: string, limit = 5): Promise<GitHubPullRequestActivity[]> {
    return this.getActivityList(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls?state=all&sort=updated&direction=desc&per_page=${normalizeLimit(limit)}`,
      (body) => {
        if (
          typeof body.number !== "number" ||
          typeof body.title !== "string" ||
          typeof body.state !== "string" ||
          typeof body.created_at !== "string" ||
          typeof body.updated_at !== "string" ||
          typeof body.html_url !== "string"
        ) {
          throw new GitHubApiError(undefined, "invalid_response");
        }
        return {
          number: body.number,
          title: body.title,
          state: body.state,
          author: isObject(body.user) && typeof body.user.login === "string" ? body.user.login : undefined,
          createdAt: body.created_at,
          updatedAt: body.updated_at,
          htmlUrl: body.html_url
        };
      }
    );
  }

  private async getActivityList<T>(
    path: string,
    mapper: (body: Record<string, unknown>) => T
  ): Promise<T[]> {
    const bodies = await this.getActivityBodies(path);
    return bodies.map(mapper);
  }

  private async getActivityBodies(path: string): Promise<Record<string, unknown>[]> {
    const response = await this.request(path);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GitHubApiError(response.status, "invalid_response");
    }
    if (!Array.isArray(body) || !body.every(isObject)) {
      throw new GitHubApiError(response.status, "invalid_response");
    }
    return body;
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

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 5;
  return Math.min(Math.max(Math.trunc(limit), 1), 10);
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}