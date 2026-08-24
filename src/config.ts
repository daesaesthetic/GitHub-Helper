export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  port: number;
  authorizedUserId?: string;
  github?: GitHubConfig;
  githubApp?: GitHubAppConfig;
}

export interface GitHubAppConfig {
  appId: number;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  slug: string;
  callbackUrl: string;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repository: string;
  repositoryId?: string;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const discordToken = env.DISCORD_TOKEN?.trim();
  const discordClientId = env.DISCORD_CLIENT_ID?.trim();
  if (!discordToken) throw new ConfigurationError("DISCORD_TOKEN is required");
  if (!discordClientId) throw new ConfigurationError("DISCORD_CLIENT_ID is required");

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError("PORT must be an integer between 1 and 65535");
  }

  const githubValues = [
    env.GITHUB_TOKEN,
    env.GITHUB_OWNER,
    env.GITHUB_REPOSITORY
  ].map((value) => value?.trim()).filter(Boolean);
  const hasGithubConfiguration = githubValues.length > 0 || Boolean(env.GITHUB_REPOSITORY_ID?.trim());
  let github: GitHubConfig | undefined;
  if (hasGithubConfiguration) {
    const token = env.GITHUB_TOKEN?.trim();
    const owner = env.GITHUB_OWNER?.trim();
    const repository = env.GITHUB_REPOSITORY?.trim();
    if (!token || !owner || !repository) {
      throw new ConfigurationError(
        "GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPOSITORY are required together"
      );
    }
    github = {
      token,
      owner,
      repository,
      repositoryId: env.GITHUB_REPOSITORY_ID?.trim() || undefined
    };
  }

  const appValues = [
    env.GITHUB_APP_ID,
    env.GITHUB_APP_PRIVATE_KEY,
    env.GITHUB_APP_CLIENT_ID,
    env.GITHUB_APP_CLIENT_SECRET,
    env.GITHUB_APP_SLUG,
    env.GITHUB_APP_CALLBACK_URL
  ].map((value) => value?.trim()).filter(Boolean);
  let githubApp: GitHubAppConfig | undefined;
  if (appValues.length > 0) {
    const appId = Number(env.GITHUB_APP_ID?.trim());
    const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
    const clientId = env.GITHUB_APP_CLIENT_ID?.trim();
    const clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim();
    const slug = env.GITHUB_APP_SLUG?.trim();
    const callbackUrl = env.GITHUB_APP_CALLBACK_URL?.trim();
    if (!Number.isSafeInteger(appId) || appId < 1 || !privateKey || !clientId || !clientSecret || !slug || !callbackUrl) {
      throw new ConfigurationError(
        "Complete GitHub App configuration is required to enable App authorization"
      );
    }
    try {
      const parsed = new URL(callbackUrl);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error();
    } catch {
      throw new ConfigurationError("GITHUB_APP_CALLBACK_URL must be an HTTPS URL");
    }
    if (!privateKey.includes("-----BEGIN")) throw new ConfigurationError("GitHub App private key configuration is invalid");
    githubApp = { appId, privateKey, clientId, clientSecret, slug, callbackUrl };
  }

  return {
    discordToken,
    discordClientId,
    port,
    authorizedUserId: env.AUTHORIZED_USER_ID?.trim() || undefined,
    github,
    githubApp
  };
}