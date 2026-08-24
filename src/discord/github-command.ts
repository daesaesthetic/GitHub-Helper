import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNotFoundError } from "../projects/project-service.js";
import { GitHubAppConfigurationError, GitHubAppService } from "../github-connections/github-app-service.js";
import type { Logger } from "../logging.js";

export const githubCommand = new SlashCommandBuilder()
  .setName("github")
  .setDescription("Connect a project to GitHub")
  .addSubcommand((subcommand) => subcommand
    .setName("connect")
    .setDescription("Start a secure GitHub App connection")
    .addStringOption((option) => option
      .setName("project")
      .setDescription("Project to connect")
      .setRequired(true)
      .addChoices({ name: "Developer Intelligence Platform", value: DEVELOPMENT_PROJECT_ID })));

export async function handleGitHubCommand(
  interaction: ChatInputCommandInteraction,
  app: GitHubAppService,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const url = await app.createConnectUrl(projectId, identity);
    await interaction.reply({
      ephemeral: true,
      content: [
        "Open this link to install and authorize GitHub access for this project:",
        url,
        "Return to Discord after GitHub confirms the connection."
      ].join("\n")
    });
    logger.info("command.completed", { command: "github.connect", userId: identity.userId, projectId });
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to connect GitHub for this project."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof GitHubAppConfigurationError
          ? "GitHub App connections are not configured yet. Existing development GitHub access is unchanged."
          : "Unable to start GitHub authorization right now.";
    logger.error("command.failed", {
      command: "github.connect",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}