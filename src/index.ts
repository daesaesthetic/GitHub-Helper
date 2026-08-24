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
import { GitHubActivityService } from "./github/github-activity-service.js";
import { Pool } from "pg";
import { PostgresContextStore } from "./context/context-store.js";
import { ContextService } from "./context/context-service.js";
import { GitHubContextIngestionService } from "./context/github-context-ingestion-service.js";
import { GetProjectContext } from "./use-cases/project-context.js";
import { contextCommand, handleContextCommand } from "./discord/context-command.js";
import { PostgresRealityStore } from "./reality/reality-store.js";
import { RealityService } from "./reality/reality-service.js";
import { ProjectRealityBootstrap } from "./reality/reality-bootstrap.js";
import { GetProjectReality } from "./use-cases/project-reality.js";
import { realityCommand, handleRealityCommand } from "./discord/reality-command.js";
import { ProjectIntelligenceService } from "./intelligence/project-intelligence-service.js";
import { GetProjectIntelligence } from "./use-cases/project-intelligence.js";
import {
  intelligenceCommand,
  handleIntelligenceCommand
} from "./discord/intelligence-command.js";
import { MilestoneService } from "./milestones/milestone-service.js";
import { PostgresMilestoneStore } from "./milestones/milestone-store.js";
import { milestoneCommand, handleMilestoneCommand } from "./discord/milestone-command.js";
import { githubCommand, handleGitHubCommand, handleGitHubRepositorySelection } from "./discord/github-command.js";
import {
  PostgresDiscordAccountStore, PostgresGitHubAuthorizationStateStore,
  PostgresGitHubConnectionStore, PostgresGitHubIdentityStore,
  PostgresProjectGitHubRepositoryStore
} from "./github-connections/github-connection-store.js";
import {
  AuthorizationStateService, DiscordAccountService, GitHubConnectionService,
  GitHubIdentityService, GitHubRepositoryAssociationService
} from "./github-connections/github-connection-services.js";
import { GitHubAppService } from "./github-connections/github-app-service.js";
import { GitHubAppAuthenticator } from "./github-connections/github-app-authenticator.js";
import { GitHubCredentialResolver } from "./github-connections/github-credential-resolver.js";

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
const github = config.github || config.githubApp
  ? new GitHubService(new GitHubClient(config.github?.token ?? ""))
  : undefined;
const projects = new ProjectService(new InMemoryProjectRepository(seedProject), github);
const activity = new GitHubActivityService(projects);
const getProjectStatus = new GetProjectStatus(projects);
const database = new Pool({ connectionString: process.env.DATABASE_URL });
const context = new ContextService(new PostgresContextStore(database), projects);
const getProjectContext = new GetProjectContext(
  projects,
  context,
  new GitHubContextIngestionService(projects, context)
);
const reality = new RealityService(new PostgresRealityStore(database), projects, context);
const getProjectReality = new GetProjectReality(
  projects,
  reality,
  new ProjectRealityBootstrap(reality)
);
const milestones = new MilestoneService(new PostgresMilestoneStore(database), projects);
const intelligence = new ProjectIntelligenceService(
  projects,
  reality,
  context,
  milestones,
  activity
);
const getProjectIntelligence = new GetProjectIntelligence(intelligence);
const discordAccounts = new DiscordAccountService(new PostgresDiscordAccountStore(database));
const githubIdentities = new GitHubIdentityService(new PostgresGitHubIdentityStore(database));
const githubConnections = new GitHubConnectionService(
  new PostgresGitHubConnectionStore(database),
  discordAccounts,
  githubIdentities
);
const githubAssociations = new GitHubRepositoryAssociationService(
  new PostgresProjectGitHubRepositoryStore(database),
  new PostgresGitHubConnectionStore(database),
  discordAccounts,
  projects
);
const githubAuthorization = new AuthorizationStateService(
  new PostgresGitHubAuthorizationStateStore(database),
  discordAccounts
);
const githubCredentials = new GitHubCredentialResolver(
  projects,
  new PostgresProjectGitHubRepositoryStore(database),
  new PostgresGitHubConnectionStore(database),
  new PostgresDiscordAccountStore(database),
  config.github?.token,
  Object.assign(new GitHubAppAuthenticator(config.githubApp), {
    onInstallationFailure: async (installationId: number, kind: "revoked" | "suspended") => {
      await githubConnections.markInstallationStatus(installationId, kind);
    }
  })
);
projects.setCredentialResolver(githubCredentials);
const githubApp = new GitHubAppService(
  config.githubApp,
  githubAuthorization,
  githubConnections,
  githubAssociations,
  projects,
  fetch,
  new GitHubAppAuthenticator(config.githubApp)
);
const healthServer = startHealthServer(config.port, logger, {
  async handle(url) {
    const completed = await githubApp.completeCallback(url.searchParams);
    return {
      status: 200,
      body: `GitHub account ${completed.login} connected successfully. Return to Discord.`
    };
  }
});
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  logger.info("discord.ready", { userId: readyClient.user.id });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("github.repositories:")) {
      await handleGitHubRepositorySelection(interaction, githubApp, logger);
      return;
    }
    if (!interaction.isChatInputCommand() ||
         !["project", "context", "reality", "intelligence", "milestone", "github"].includes(interaction.commandName)) return;
    if (interaction.commandName === "project") {
      await handleProjectCommand(interaction, getProjectStatus, logger);
    } else if (interaction.commandName === "context") {
      await handleContextCommand(interaction, getProjectContext, logger);
    } else if (interaction.commandName === "reality") {
      await handleRealityCommand(interaction, getProjectReality, logger);
    } else if (interaction.commandName === "milestone") {
      await handleMilestoneCommand(interaction, milestones, logger);
    } else if (interaction.commandName === "github") {
      await handleGitHubCommand(interaction, githubApp, logger);
    } else {
      await handleIntelligenceCommand(interaction, getProjectIntelligence, logger);
    }
  } catch (error) {
    logger.error("interaction.unhandled", {
      command: interaction.commandName,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: "The command could not be completed safely. Please try again. If the problem continues, check /health.",
        ephemeral: true
      });
    }
  }
});

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: [
      projectStatusCommand.toJSON(),
      contextCommand.toJSON(),
      realityCommand.toJSON(),
      intelligenceCommand.toJSON(),
      milestoneCommand.toJSON(),
      githubCommand.toJSON()
    ]
  });
  logger.info("discord.commands_registered", {
    commands: [
      "project status",
      "context project",
      "reality project",
      "intelligence project",
      "milestone list/create/update/status/delete",
      "github connect/status/repositories/disconnect"
    ]
  });
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