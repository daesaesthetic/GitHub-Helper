export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  port: number;
  authorizedUserId?: string;
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

  return {
    discordToken,
    discordClientId,
    port,
    authorizedUserId: env.AUTHORIZED_USER_ID?.trim() || undefined
  };
}