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
    const result = getProjectStatus.execute(projectId, identity);
    logger.info("command.completed", { command: "project.status", userId: identity.userId, projectId });
    await interaction.reply([
      `**${result.name}**`,
      `Status: ${result.status}`,
      result.description,
      `Owner: <@${result.ownerId}>`,
      `GitHub: ${result.integrations.includes("github") ? "Connected" : "Not connected"}`
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