export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  port: number;
  authorizedUserId?: string;
  github?: GitHubConfig;
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

  return {
    discordToken,
    discordClientId,
    port,
    authorizedUserId: env.AUTHORIZED_USER_ID?.trim() || undefined,
    github
  };
}