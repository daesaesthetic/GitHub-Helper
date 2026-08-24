import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { extractIdentity } from "../identity.js";
import { ProjectAccessDeniedError, ProjectNameAmbiguousError, ProjectNotFoundError } from "../projects/project-service.js";
import { DEVELOPMENT_PROJECT_ID } from "../projects/project.js";
import type { Logger } from "../logging.js";
import { GetProjectReality } from "../use-cases/project-reality.js";
import { setProjectAutocomplete } from "./project-autocomplete.js";

export const realityCommand = new SlashCommandBuilder()
  .setName("reality")
  .setDescription("Inspect verified project state")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("project")
      .setDescription("View verified project state")
       .addStringOption((option) => setProjectAutocomplete(option, "Project ID or name to inspect"))
  );

export async function handleRealityCommand(
  interaction: ChatInputCommandInteraction,
  getProjectReality: GetProjectReality,
  logger: Logger
): Promise<void> {
  const identity = extractIdentity(interaction);
  const projectId = interaction.options.getString("project", true);
  try {
    const result = await getProjectReality.execute(projectId, identity);
    logger.info("command.completed", {
      command: "reality.project",
      userId: identity.userId,
      projectId,
      records: result.records.length
    });
    await interaction.reply(formatReality(result));
  } catch (error) {
    const message = error instanceof ProjectAccessDeniedError
      ? "You are not authorized to view this project reality."
      : error instanceof ProjectNotFoundError
        ? "That project could not be found."
        : error instanceof ProjectNameAmbiguousError
          ? "More than one project has that name. Use its project ID instead."
        : "Unable to retrieve project reality right now.";
    logger.error("command.failed", {
      command: "reality.project",
      userId: identity.userId,
      projectId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    await interaction.reply({ content: message, ephemeral: true });
  }
}

function formatReality(result: Awaited<ReturnType<GetProjectReality["execute"]>>): string {
  if (result.records.length === 0) {
    return [
      `**${result.projectName}**`,
      "Verified reality facts: 0",
      "No verified Reality facts are configured for this project."
    ].join("\n");
  }
  const facts = result.records.map((record) => {
    const value = Object.entries(record.value)
      .map(([key, item]) => `${key}=${item}`)
      .join(", ");
    return `- ${record.factType} [${record.verificationState}]: ${value}`;
  });
  return [
    `**${result.projectName}**`,
    `Verified reality facts: ${result.records.length}`,
    ...facts
  ].join("\n");
}