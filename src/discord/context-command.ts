import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from "discord.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNameAmbiguousError, ProjectNotFoundError } from "../projects/project-service.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import type { Logger } from "../logging.js";
import { GetProjectContext } from "../use-cases/project-context.js";

export const contextCommand = new SlashCommandBuilder()
  .setName("context")
  .setDescription("Inspect available project context")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("project")
      .setDescription("View project context sources")
      .addStringOption((option) =>
        option
          .setName("project")
           .setDescription("Project ID or name to inspect")
           .setRequired(true)
      )
  );

export async function handleContextCommand(
  interaction: ChatInputCommandInteraction,
  getProjectContext: GetProjectContext,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const result = await getProjectContext.execute(projectId, identity);
    logger.info("command.completed", {
      command: "context.project",
      userId: identity.userId,
      projectId,
      records: result.records.length
    });
    await interaction.reply(formatContext(result));
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view this project context."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof ProjectNameAmbiguousError
          ? "More than one project has that name. Use its project ID instead."
        : "Unable to retrieve project context right now.";
    logger.error("command.failed", {
      command: "context.project",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}

function formatContext(result: Awaited<ReturnType<GetProjectContext["execute"]>>): string {
  if (result.records.length === 0) {
    return [
      `**${result.projectName}**`,
      "Context records: 0",
      ...(result.ingestion.reason
        ? [
          `Context refresh: unavailable (${result.ingestion.reason})`,
          "No Context records are available yet. Retry after GitHub becomes available."
        ]
        : [
          `Context refresh: ${result.ingestion.ingested} ingested, ${result.ingestion.updated} updated`,
          "No project context is available yet."
        ])
    ].join("\n");
  }
  const sourceTypes = [...new Set(result.records.map((record) => record.sourceType))];
  const sources = result.records.slice(0, 3).map((record) => {
    const source = record.provenance.filePath ?? record.provenance.repositoryName ?? record.sourceIdentity;
    return `- ${record.sourceType}: ${source}`;
  });
  return [
    `**${result.projectName}**`,
    `Context records: ${result.records.length}`,
    ...(result.ingestion.reason
      ? [`Context refresh: unavailable (${result.ingestion.reason}); existing records are shown below.`]
      : [`Context refresh: ${result.ingestion.ingested} ingested, ${result.ingestion.updated} updated`]),
    `Source types: ${sourceTypes.join(", ")}`,
    "Sources:",
    ...sources
  ].join("\n");
}