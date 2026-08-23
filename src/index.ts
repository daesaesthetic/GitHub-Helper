import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { loadConfig, ConfigurationError, type AppConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { startHealthServer } from "./health.js";
import { createSeedProject } from "./projects/project.js";
import { InMemoryProjectRepository, ProjectService } from "./projects/project-service.js";
import { GetProjectStatus } from "./use-cases/project-status.js";
import { handleProjectCommand, projectStatusCommand } from "./discord/project-status-command.js";

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
const projects = new ProjectService(new InMemoryProjectRepository(createSeedProject(ownerId)));
const getProjectStatus = new GetProjectStatus(projects);
const healthServer = startHealthServer(config.port, logger);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  logger.info("discord.ready", { userId: readyClient.user.id });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "project") return;
  try {
    await handleProjectCommand(interaction, getProjectStatus, logger);
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
    body: [projectStatusCommand.toJSON()]
  });
  logger.info("discord.commands_registered", { commands: ["project status"] });
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