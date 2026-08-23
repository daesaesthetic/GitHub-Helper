import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { loadConfig, ConfigurationError, type AppConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { startHealthServer } from "./health.js";
import { createSeedProject } from "./projects/project.js";
import { InMemoryProjectRepository, ProjectService } from "./projects/project-service.js";
import { GetProjectStatus } from "./use-cases/project-status.js";
import { handleProjectCommand, projectStatusCommand } from "./discord/project-status-command.js";
import { GitHubClient } from "./github/github-client.js";
import { GitHubService } from "./github/github-service.js";
import { Pool } from "pg";
import { PostgresContextStore } from "./context/context-store.js";
import { ContextService } from "./context/context-service.js";
import { GitHubContextIngestionService } from "./context/github-context-ingestion-service.js";
import { GetProjectContext } from "./use-cases/project-context.js";
import { contextCommand, handleContextCommand } from "./discord/context-command.js";

const logger = createLogger();
let config: AppConfig;
try {
  config = loadConfig(process.env);
} catch (error) {
  logger.error("application.configuration_failed", {
    error: error instanceof ConfigurationError ? error.message : "Unknown configuration error"
  });
  process.exit(1);
}

const ownerId = config.authorizedUserId ?? "development-owner";
const seedProject = createSeedProject(ownerId);
if (config.github) {
  seedProject.integrations.github = {
    owner: config.github.owner,
    repository: config.github.repository,
    repositoryId: config.github.repositoryId
  };
  seedProject.integrationReferences = ["github"];
}
const github = config.github ? new GitHubService(new GitHubClient(config.github.token)) : undefined;
const projects = new ProjectService(new InMemoryProjectRepository(seedProject), github);
const getProjectStatus = new GetProjectStatus(projects);
const database = new Pool({ connectionString: process.env.DATABASE_URL });
const context = new ContextService(new PostgresContextStore(database), projects);
const getProjectContext = new GetProjectContext(
  projects,
  context,
  new GitHubContextIngestionService(projects, context)
);
const healthServer = startHealthServer(config.port, logger);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  logger.info("discord.ready", { userId: readyClient.user.id });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !["project", "context"].includes(interaction.commandName)) return;
  try {
    if (interaction.commandName === "project") {
      await handleProjectCommand(interaction, getProjectStatus, logger);
    } else {
      await handleContextCommand(interaction, getProjectContext, logger);
    }
  } catch (error) {
    logger.error("interaction.unhandled", {
      command: interaction.commandName,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: "An unexpected error occurred.", ephemeral: true });
    }
  }
});

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: [projectStatusCommand.toJSON(), contextCommand.toJSON()]
  });
  logger.info("discord.commands_registered", { commands: ["project status", "context project"] });
}

async function start(): Promise<void> {
  await registerCommands();
  await client.login(config.discordToken);
  logger.info("application.started");
}

function shutdown(signal: string): void {
  logger.info("application.shutdown", { signal });
  healthServer.close();
  client.destroy();
  void database.end();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
start().catch((error) => {
  logger.error("application.start_failed", {
    error: error instanceof Error ? error.name : "UnknownError"
  });
  shutdown("startup_failure");
  process.exit(1);
});