import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { loadConfig, ConfigurationError, type AppConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { startHealthServer } from "./health.js";
import { createSeedProject } from "./projects/project.js";
import { ProjectService } from "./projects/project-service.js";
import { PostgresProjectRepository } from "./projects/project-store.js";
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
import { activityCommand, handleActivityCommand } from "./discord/activity-command.js";
import { trendsCommand, handleTrendsCommand } from "./discord/trends-command.js";
import { helpCommand, handleHelpCommand } from "./discord/help-command.js";
import { setupCommand, handleSetupCommand } from "./discord/setup-command.js";
import { GetProjectActivity } from "./use-cases/project-activity.js";
import { GetProjectTrends } from "./use-cases/project-trends.js";
import { handleProjectAutocomplete } from "./discord/project-autocomplete.js";
import { extractIdentity } from "./identity.js";
import { EnvironmentSecretProvider } from "./secrets/secret-provider.js";
import { GetProjectSecrets } from "./use-cases/project-secrets.js";
import { secretsCommand, handleSecretsCommand } from "./discord/secrets-command.js";
import { UnavailableAiService } from "./ai/ai-service.js";
import { GetProjectExplanation } from "./use-cases/project-explanation.js";
import { explainCommand, handleExplainCommand } from "./discord/explain-command.js";

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
const database = new Pool({ connectionString: process.env.DATABASE_URL });
const projectRepository = new PostgresProjectRepository(database);
await projectRepository.initialize();
const seedProject = createSeedProject(ownerId);
if (config.github) {
  seedProject.integrations.github = {
    owner: config.github.owner,
    repository: config.github.repository,
    repositoryId: config.github.repositoryId
  };
  seedProject.integrationReferences = ["github"];
}
const github = config.github || config.githubApp || config.githubToken
  ? new GitHubService(new GitHubClient(config.githubToken ?? ""))
  : undefined;
await projectRepository.save(seedProject);
const projects = new ProjectService(projectRepository, github);
const activity = new GitHubActivityService(projects);
const getProjectActivity = new GetProjectActivity(activity);
const getProjectStatus = new GetProjectStatus(projects);
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
const getProjectTrends = new GetProjectTrends(intelligence);
const getProjectSecrets = new GetProjectSecrets(projects, new EnvironmentSecretProvider(projects));
const getProjectExplanation = new GetProjectExplanation(projects, intelligence, new UnavailableAiService());
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
   config.githubToken,
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
  const interactionLabel = interaction.isChatInputCommand()
    ? interaction.commandName
    : interaction.isStringSelectMenu()
      ? "github.repositories.select"
      : "interaction";
  try {
    if (interaction.isAutocomplete()) {
      if (["project", "context", "reality", "intelligence", "milestone", "github", "activity", "trends"]
        .includes(interaction.commandName)) {
        await handleProjectAutocomplete(interaction, projects, extractIdentity(interaction));
      }
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("github.repositories:")) {
      await handleGitHubRepositorySelection(interaction, githubApp, logger);
      return;
    }
    if (!interaction.isChatInputCommand() ||
         !["project", "context", "reality", "intelligence", "milestone", "github", "activity", "trends", "secrets", "explain", "help", "setup"].includes(interaction.commandName)) return;
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
    } else if (interaction.commandName === "activity") {
      await handleActivityCommand(interaction, getProjectActivity, logger);
    } else if (interaction.commandName === "trends") {
      await handleTrendsCommand(interaction, getProjectTrends, logger);
    } else if (interaction.commandName === "secrets") {
      await handleSecretsCommand(interaction, getProjectSecrets, logger);
    } else if (interaction.commandName === "explain") {
      await handleExplainCommand(interaction, getProjectExplanation, logger);
    } else if (interaction.commandName === "help") {
      await handleHelpCommand(interaction, ownerId, logger);
    } else if (interaction.commandName === "setup") {
      await handleSetupCommand(interaction, ownerId, {
        githubConfigured: Boolean(config.githubToken),
        githubAppConfigured: Boolean(config.githubApp)
      }, logger);
    } else {
      await handleIntelligenceCommand(interaction, getProjectIntelligence, logger);
    }
  } catch (error) {
    logger.error("interaction.unhandled", {
      command: interactionLabel,
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
      githubCommand.toJSON(),
      activityCommand.toJSON(),
      trendsCommand.toJSON(),
      secretsCommand.toJSON(),
      explainCommand.toJSON(),
      helpCommand.toJSON(),
      setupCommand.toJSON()
    ]
  });
  logger.info("discord.commands_registered", {
    commands: [
      "project status",
      "context project",
      "reality project",
      "intelligence project",
      "milestone list/create/update/status/delete",
      "github connect/status/repositories/disconnect",
      "activity project",
      "trends project",
      "secrets list",
      "explain project",
      "help",
      "setup"
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