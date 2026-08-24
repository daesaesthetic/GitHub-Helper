import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { extractIdentity } from "../identity.js";
import { GetProjectStatus } from "../use-cases/project-status.js";
import { ProjectAccessDeniedError, ProjectNotFoundError } from "../projects/project-service.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import type { Logger } from "../logging.js";

export const projectStatusCommand = new SlashCommandBuilder()
  .setName("project")
  .setDescription("Inspect a project")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("View project status")
      .addStringOption((option) =>
        option
          .setName("project")
          .setDescription("Project to inspect")
          .setRequired(true)
          .addChoices({ name: "Developer Intelligence Platform", value: DEVELOPMENT_PROJECT_ID })
      )
  );

export async function handleProjectCommand(
  interaction: ChatInputCommandInteraction,
  getProjectStatus: GetProjectStatus,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const result = await getProjectStatus.execute(projectId, identity);
    logger.info("command.completed", { command: "project.status", userId: identity.userId, projectId });
    await interaction.reply([
      `**${result.name}**`,
      `Status: ${result.status}`,
      result.description,
      `Owner: <@${result.ownerId}>`,
      formatGitHub(result)
    ].join("\n"));
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view this project."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : "Unable to retrieve project status right now.";
    logger.error("command.failed", {
      command: "project.status",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}

function formatGitHub(result: Awaited<ReturnType<GetProjectStatus["execute"]>>): string {
  if (!result.github || !result.github.connected) {
    return result.github?.reason === "not_configured"
      ? "GitHub: Not configured\nConfigure development GitHub access or use /github connect when GitHub App authorization is available."
      : "GitHub: Unavailable\nRepository status could not be established right now.";
  }
  const repository = result.github.repository;
  return [
    "GitHub: Connected",
    `Repository: ${repository.fullName}`,
    `Visibility: ${repository.private ? "Private" : "Public"}`,
    `Default Branch: ${repository.defaultBranch}`,
    `Repository URL: ${repository.htmlUrl}`,
    `Repository Status: ${repository.archived ? "Archived" : repository.disabled ? "Disabled" : "Active"}`
  ].join("\n");
}