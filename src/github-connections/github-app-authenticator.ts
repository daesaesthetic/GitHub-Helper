import { createSign } from "node:crypto";
import type { GitHubAppConfig } from "../config.js";

export class GitHubAppAuthenticationError extends Error {}

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

export interface GitHubInstallation {
  id: number;
  appId: number;
  accountId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
}

export interface InstallationRepository {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  htmlUrl: string;
}

export class GitHubAppAuthenticator {
  constructor(
    private readonly config: GitHubAppConfig | undefined,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  createAppJwt(now = Math.floor(Date.now() / 1000)): string {
    if (!this.config) throw new GitHubAppAuthenticationError("GitHub App authorization is not configured");
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const issuedAt = now - 60;
    const payload = base64url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 540, iss: this.config.appId }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    let signature: string;
    try {
      signature = signer.sign(this.config.privateKey, "base64url");
    } catch {
      throw new GitHubAppAuthenticationError("GitHub App private key could not be used");
    }
    return `${header}.${payload}.${signature}`;
  }

  async getInstallation(installationId: number): Promise<GitHubInstallation> {
    const body = await this.request(`/app/installations/${installationId}`, "GET", undefined, true);
    const account = asObject(body.account);
    if (
      body.id !== installationId ||
      typeof body.app_id !== "number" ||
      !account ||
      typeof account.id !== "number" ||
      typeof account.login !== "string" ||
      (account.type !== "User" && account.type !== "Organization")
    ) throw new GitHubAppAuthenticationError("GitHub installation response was invalid");
    if (body.app_id !== this.config?.appId) throw new GitHubAppAuthenticationError("GitHub installation belongs to another App");
    return { id: installationId, appId: body.app_id, accountId: account.id, accountLogin: account.login, accountType: account.type };
  }

  async createInstallationToken(installationId: number): Promise<InstallationToken> {
    const body = await this.request(`/app/installations/${installationId}/access_tokens`, "POST", {}, true);
    if (typeof body.token !== "string" || typeof body.expires_at !== "string") {
      throw new GitHubAppAuthenticationError("GitHub installation token response was invalid");
    }
    return { token: body.token, expiresAt: body.expires_at };
  }

  async listRepositories(installationId: number, maxPages = 5): Promise<InstallationRepository[]> {
    const token = await this.createInstallationToken(installationId);
    const repositories: InstallationRepository[] = [];
    for (let page = 1; page <= Math.min(Math.max(maxPages, 1), 5); page++) {
      const body = await this.request(`/installation/repositories?per_page=100&page=${page}`, "GET", undefined, false, token.token);
      if (!Array.isArray(body.repositories)) throw new GitHubAppAuthenticationError("GitHub repository response was invalid");
      for (const value of body.repositories) {
        const repository = asObject(value);
        const owner = repository && asObject(repository.owner);
        if (
          !repository || !owner || typeof repository.id !== "number" ||
          typeof repository.full_name !== "string" || typeof repository.name !== "string" ||
          typeof repository.private !== "boolean" || typeof repository.html_url !== "string" ||
          typeof owner.login !== "string"
        ) throw new GitHubAppAuthenticationError("GitHub repository response was invalid");
        repositories.push({
          id: repository.id,
          fullName: repository.full_name,
          owner: owner.login,
          name: repository.name,
          private: repository.private,
          htmlUrl: repository.html_url
        });
      }
      if (repositories.length === 0 || repositories.length < page * 100) break;
    }
    return repositories;
  }

  private async request(
    path: string,
    method: "GET" | "POST",
    body?: object,
    useAppJwt = false,
    token?: string
  ): Promise<Record<string, any>> {
    const authorization = token ?? (useAppJwt ? this.createAppJwt() : undefined);
    if (!authorization) throw new GitHubAppAuthenticationError("GitHub credential is unavailable");
    let response: Response;
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${authorization}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "developer-intelligence-platform"
      };
      if (body) headers["Content-Type"] = "application/json";
      response = await this.fetcher(`https://api.github.com${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch {
      throw new GitHubAppAuthenticationError("GitHub App API is unavailable");
    }
    if (!response.ok) throw new GitHubAppAuthenticationError("GitHub App API request failed");
    let result: unknown;
    try { result = await response.json(); } catch { throw new GitHubAppAuthenticationError("GitHub App response was invalid"); }
    const object = asObject(result);
    if (!object) throw new GitHubAppAuthenticationError("GitHub App response was invalid");
    return object;
  }
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
function asObject(value: unknown): Record<string, any> | undefined {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined;
}